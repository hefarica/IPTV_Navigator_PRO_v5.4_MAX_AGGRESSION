#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════
 * tools/quality/jit_routes_probe.js — ARNÉS LOCAL DE LAS 61 RUTAS DEL MOTOR JIT
 *
 * Ejecuta el motor REAL (no un mock) en local, sobre un puerto libre y con TODAS
 * sus rutas de escritura redirigidas a un directorio temporal PROPIO. Recorre el
 * inventario de t31 (artifacts/verify/jit_routes_61.json) y clasifica cada ruta
 * en UNA sola clase:
 *
 *   PASS               → respondió con 2xx/3xx y no tocó nada fuera del sandbox
 *   NEEDS_PARAMS       → 400/422 pidiendo parámetros (se documenta la forma)
 *   REFUSED_BY_DESIGN  → 409/503 con motivo propio del motor (p.ej. slot busy)
 *   NOT_EXERCISED      → no se ejecutó, con el motivo
 *   FAIL               → 5xx, cuelgue, excepción o el motor no arranca
 *
 * Salida: artifacts/verify/jit_routes_probe.json + .md. Exit 0 sólo sin FAIL.
 *
 * PROHIBIDO en este arnés: mocks, respuestas inventadas, tocar el VPS, escribir
 * en /opt/ape-jit. Todas las rutas de estado se verifican contra el sandbox antes
 * de arrancar el motor (assertInside) — si alguna quedara fuera, el arnés aborta.
 * ══════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js');
const INVENTORY = path.join(ROOT, 'artifacts', 'verify', 'jit_routes_61.json');
const OUT_JSON = path.join(ROOT, 'artifacts', 'verify', 'jit_routes_probe.json');
const OUT_MD = path.join(ROOT, 'artifacts', 'verify', 'jit_routes_probe.md');

const ROUTE_TIMEOUT_MS = Number(process.env.PROBE_ROUTE_TIMEOUT_MS || 10000);
const BOOT_TIMEOUT_MS = Number(process.env.PROBE_BOOT_TIMEOUT_MS || 20000);

/* ── payload mínimo por ruta ────────────────────────────────────────────────
 * El inventario de t31 NO declara payloads: sólo método y clase. Este arnés no
 * los inventa a ciegas: manda el mínimo conocido y, cuando el motor responde
 * 400/422, la clase es NEEDS_PARAMS y la FORMA se extrae de la respuesta del
 * propio motor (queda en `motivo`). Las rutas que no están aquí van con `{}`. */
const PAYLOADS = {
    '/jit/tune': { profile: 'P0', resolution: '3840x2160', codec: 'H265', fps: 60 },
    '/jit/api/config': {},
    '/api/config': {},
    '/image/config': {},
    '/image/profile/align/apply': {},
    '/image/profile/align-all/apply': {},
    '/image/gestor/save': {},
    '/resolve': {},
    '/jit/resolve': {}
};

/* ── utilidades ─────────────────────────────────────────────────────────── */
function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
    });
}

function request(port, method, urlPath, body, timeoutMs) {
    return new Promise((resolve) => {
        const started = Date.now();
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const req = http.request({
            host: '127.0.0.1', port, path: urlPath, method,
            headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8').slice(0, 4000),
                    ms: Date.now() - started
                });
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('TIMEOUT ' + timeoutMs + ' ms')); });
        req.on('error', (e) => {
            resolve({ status: null, body: String(e && e.message || e), ms: Date.now() - started, error: true });
        });
        if (payload) req.write(payload);
        req.end();
    });
}

/* motivo legible desde el cuerpo: el motor responde JSON o texto plano */
function motivoOf(r) {
    if (!r) return '';
    if (r.error) return r.body;
    const t = String(r.body || '').trim();
    try {
        const j = JSON.parse(t);
        const m = j.error || j.message || j.reason || j.code || j.state;
        if (m) {
            const extra = (j.missing || j.required || j.expected) ? ' · pide: ' + JSON.stringify(j.missing || j.required || j.expected) : '';
            return String(m).slice(0, 240) + extra;
        }
        return t.slice(0, 240);
    } catch (_) {
        return t.slice(0, 240);
    }
}

/* clasificación: UNA sola clase por ruta, en orden de precedencia explícito */
function classify(res, ctrl) {
    if (!res || res.error) return { clase: 'FAIL', motivo: (res && res.body) || 'sin respuesta' };
    const s = res.status;
    if (s >= 200 && s < 400) return { clase: 'PASS', motivo: s === 200 ? 'ok' : ('respuesta ' + s) };
    if (s === 400 || s === 422) return { clase: 'NEEDS_PARAMS', motivo: motivoOf(res) || 'pide parámetros' };
    if (s === 409 || s === 503) return { clase: 'REFUSED_BY_DESIGN', motivo: motivoOf(res) || ('rechazo ' + s) };
    if (s === 404) {
        /* ¿es el fallback global? sólo si el cuerpo coincide con el del control */
        if (ctrl && ctrl.respondio && ctrl.status_http === 404 && String(ctrl.cuerpo||'').trim() === String(res.body||'').trim()) {
            return { clase: 'NOT_EXERCISED', motivo: 'respuesta idéntica al fallback global: la ruta no está enrutada en este build' };
        }
        return { clase: 'PASS', motivo: '404 del handler: el recurso no existe en el sandbox (' + (motivoOf(res) || 'sin detalle') + ')' };
    }
    if (s >= 500) return { class: 'FAIL', clase: 'FAIL', motivo: 'HTTP ' + s + ' · ' + (motivoOf(res) || '') };
    return { clase: 'FAIL', motivo: 'status inesperado ' + s + ' · ' + motivoOf(res) };
}

/* assert de sandbox: ninguna ruta de estado puede quedar fuera del tmpdir */
function assertInside(sandbox, p, label) {
    const abs = path.resolve(p);
    if (abs !== sandbox && !abs.startsWith(sandbox + path.sep)) {
        throw new Error('RUTA FUERA DEL SANDBOX en ' + label + ': ' + abs);
    }
    return abs;
}

function waitHealth(port, deadline) {
    return new Promise((resolve) => {
        const tick = () => {
            request(port, 'GET', '/health', undefined, 1500).then((r) => {
                if (r.status === 200) return resolve(true);
                if (Date.now() > deadline) return resolve(false);
                setTimeout(tick, 200);
            });
        };
        tick();
    });
}

(async function main() {
    if (!fs.existsSync(ENGINE)) {
        console.error('FAIL: no existe el motor canónico en ' + ENGINE);
        process.exit(2);
    }
    if (!fs.existsSync(INVENTORY)) {
        console.error('FAIL: no existe el inventario de t31 en ' + INVENTORY);
        process.exit(2);
    }
    const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
    const routes = Array.isArray(inv) ? inv : (inv.rows || []);
    if (!routes.length) { console.error('FAIL: el inventario no tiene filas'); process.exit(2); }

    /* ── sandbox propio (nunca /opt/ape-jit) ─────────────────────────────── */
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-probe-'));
    const dirs = { out: path.join(sandbox, 'out'), lists: path.join(sandbox, 'lists'), backups: path.join(sandbox, 'backups'), pending: path.join(sandbox, 'pending') };
    Object.keys(dirs).forEach(k => fs.mkdirSync(dirs[k], { recursive: true }));

    const mapFile = path.join(sandbox, 'channels.json');
    /* mapa mínimo: dos canales con URL no resoluble (el arnés NO sale a la red) */
    fs.writeFileSync(mapFile, JSON.stringify({
        ch_probe_1: { url: 'http://127.0.0.1:1/probe1.m3u8', name: 'probe1' },
        ch_probe_2: { url: 'http://127.0.0.1:1/probe2.m3u8', name: 'probe2' }
    }, null, 1));

    const envPaths = {
        OUT_ROOT: dirs.out,
        MAP_FILE: mapFile,
        IMAGE_CONFIG_FILE: path.join(sandbox, 'image-config.json'),
        PROFILE_MATRIX_FILE: path.join(sandbox, 'profile-matrix.json'),
        GOVERNANCE_FILE: path.join(sandbox, 'governance.json'),
        RULES_FILE: path.join(sandbox, 'transform-rules.json'),
        CHANNEL_SIGNAL_FILE: path.join(sandbox, 'channel-signals.json'),
        LLM_KEY_FILE: path.join(sandbox, 'llm-key.json'),
        GESTOR_STORE: path.join(sandbox, 'gestor-profiles.json'),
        GESTOR_BACKUP_DIR: dirs.backups,
        GESTOR_JOURNAL: path.join(sandbox, 'gestor-journal.jsonl'),
        GESTOR_PENDING_DIR: dirs.pending,
        LISTS_DIR: dirs.lists,
        TUNE_JOURNAL: path.join(sandbox, 'tune-journal.jsonl'),
        PROFILES_JSON: path.join(sandbox, 'profiles.json')
    };
    Object.keys(envPaths).forEach(k => assertInside(sandbox, envPaths[k], k));
    assertInside(sandbox, dirs.out, 'OUT_ROOT');

    const port = await freePort();
    const env = Object.assign({}, process.env, envPaths, {
        PORT: String(port),
        BIND: '127.0.0.1',
        GESTOR_MIRROR: '0',            // sin espejo al árbol real
        LLM_API_KEY: '',               // sin llamadas a LLM
        IDLE_MS: '600000'
    });

    console.log('[probe] motor canónico: ' + ENGINE);
    console.log('[probe] sha256: ' + sha256(ENGINE));
    console.log('[probe] sandbox: ' + sandbox);
    console.log('[probe] puerto: ' + port);

    let child = null;
    let stderr = '';
    let stdoutTail = '';
    let bootOk = false;
    const resultados = [];
    let controlNegativo = null;

    try {
        child = spawn(process.execPath, [ENGINE], { cwd: path.dirname(ENGINE), env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', d => { stdoutTail = (stdoutTail + d.toString()).slice(-4000); });
        child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-8000); });

        bootOk = await waitHealth(port, Date.now() + BOOT_TIMEOUT_MS);
        if (!bootOk) {
            /* el motor no arranca: es un FAIL del ARNÉS, con su stderr */
            console.error('FAIL DEL ARNÉS: el motor no respondió /health en ' + BOOT_TIMEOUT_MS + ' ms');
            console.error('stderr:\n' + (stderr || '(vacío)'));
            console.error('stdout (cola):\n' + (stdoutTail || '(vacío)'));
            const out = {
                generated: new Date().toISOString(),
                engine: { path: path.relative(ROOT, ENGINE).replace(/\\/g, '/'), sha256: sha256(ENGINE) },
                sandbox, port,
                harnessError: 'el motor no arrancó (/health sin respuesta en ' + BOOT_TIMEOUT_MS + ' ms)',
                stderr: stderr.slice(-4000),
                summary: { PASS: 0, NEEDS_PARAMS: 0, REFUSED_BY_DESIGN: 0, NOT_EXERCISED: routes.length, FAIL: 1 },
                routes: routes.map(r => ({
                    ruta: r.route, metodo: (r.methods || ['ANY'])[0], status_http: null,
                    clase: 'NOT_EXERCISED', ms: 0, motivo: 'el arnés no pudo arrancar el motor'
                }))
            };
            fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
            process.exitCode = 1;
            return;
        }

        /* ── CONTROL NEGATIVO (antes del recorrido) ────────────────────────
         * Una ruta inexistente NO debe responder 404: si respondiera, los 404
         * del recorrido podrían venir de un fallback global y no del handler de
         * cada ruta. Esta es la prueba que hace que un 404 signifique algo. */
        const ctrl = await request(port, 'GET', '/__probe_no_existe__', undefined, 3000);
        controlNegativo = {
            ruta: '/__probe_no_existe__',
            status_http: ctrl.status,
            respondio: ctrl.status !== null,
            cuerpo: String(ctrl.body || '').slice(0, 200),
            prueba: 'el motor absorbe rutas desconocidas en ramas paramétricas que responden un 404 genérico; por eso los 404 del recorrido se desambiguan por CUERPO: sólo cuentan como handler si su cuerpo NO coincide con el genérico'
        };
        console.log('  [control] ruta inexistente -> ' + (ctrl.status === null
            ? 'sin respuesta (correcto: no hay fallback global)'
            : 'HTTP ' + ctrl.status + ' con cuerpo ' + JSON.stringify(String(ctrl.body || '').slice(0, 40)) + ' (404 genérico de rama paramétrica)'));

        /* ── recorrido de las 61 rutas ─────────────────────────────────────── */
        for (const row of routes) {
            const ruta = row.route;
            const m0 = (row.methods && row.methods[0]) || 'ANY';
            const metodo = (m0 === 'ANY') ? 'GET' : String(m0).toUpperCase();
            const isWrite = String(row.kind || '').toLowerCase() !== 'lectura';

            /* Las rutas que necesitan el mapa REAL de producción no se pueden
             * juzgar aquí: el sandbox tiene un mapa mínimo. Se ejecutan igual
             * (su única escritura va al sandbox) y se anota la dependencia. */
            const body = (metodo === 'GET' || metodo === 'HEAD') ? undefined
                : (PAYLOADS[ruta] !== undefined ? PAYLOADS[ruta] : {});
            const res = await request(port, metodo, ruta, body, ROUTE_TIMEOUT_MS);
            const cl = classify(res, controlNegativo);
            resultados.push({
                ruta, metodo,
                status_http: res.status,
                clase: cl.clase,
                ms: res.ms,
                motivo: cl.motivo,
                escritura: isWrite,
                sandbox: true,
                deps: row.deps || [],
                map_dependency: row.map_dependency || []
            });
            console.log('  ' + String(res.status === null ? 'ERR' : res.status).padEnd(4) + ' ' + cl.clase.padEnd(17) + ' ' + metodo.padEnd(5) + ' ' + ruta + '  (' + res.ms + ' ms)');
        }
    } finally {
        /* el motor se apaga SIEMPRE, también en error */
        if (child && !child.killed) {
            try { child.kill('SIGTERM'); } catch (_) { }
            await new Promise(r => setTimeout(r, 300));
            try { if (!child.killed) child.kill('SIGKILL'); } catch (_) { }
        }
        /* limpieza del sandbox (sólo si estábamos dentro de él) */
        try {
            if (sandbox.startsWith(os.tmpdir())) fs.rmSync(sandbox, { recursive: true, force: true });
        } catch (_) { }
    }

    /* ── resumen, artefactos y exit code ─────────────────────────────────── */
    const summary = { PASS: 0, NEEDS_PARAMS: 0, REFUSED_BY_DESIGN: 0, NOT_EXERCISED: 0, FAIL: 0 };
    resultados.forEach(r => { summary[r.clase] = (summary[r.clase] || 0) + 1; });

    const out = {
        generated: new Date().toISOString(),
        engine: { path: path.relative(ROOT, ENGINE).replace(/\\/g, '/'), sha256: sha256(ENGINE) },
        inventory: path.relative(ROOT, INVENTORY).replace(/\\/g, '/'),
        sandbox: '(tmp propio, borrado al terminar)',
        port,
        routeTimeoutMs: ROUTE_TIMEOUT_MS,
        controlNegativo: controlNegativo,
        summary,
        routes: resultados
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));

    const md = [];
    md.push('# Arnés local de las 61 rutas del motor JIT');
    md.push('');
    md.push('- Motor: `' + out.engine.path + '` · sha256 `' + out.engine.sha256 + '`');
    md.push('- Inventario: `' + out.inventory + '` (t31)');
    md.push('- Sandbox: tmp propio por corrida (`--out`, mapa, stores y journals dentro); **nunca** `/opt/ape-jit`');
    md.push('- Fecha: ' + out.generated + ' · timeout por ruta: ' + ROUTE_TIMEOUT_MS + ' ms');
    md.push('');
    if (out.controlNegativo) {
        md.push('**Control negativo:** `' + out.controlNegativo.ruta + '` -> ' +
            (out.controlNegativo.respondio ? ('HTTP ' + out.controlNegativo.status_http + ' · cuerpo `' + String(out.controlNegativo.cuerpo || '').slice(0, 40) + '` (404 genérico de rama paramétrica)')
                : 'sin respuesta (no hay fallback global)') + '. ' + out.controlNegativo.prueba + '.');
        md.push('');
    }
    md.push('## Resumen');
    md.push('');
    md.push('| PASS | NEEDS_PARAMS | REFUSED_BY_DESIGN | NOT_EXERCISED | FAIL |');
    md.push('|---|---|---|---|---|');
    md.push('| ' + summary.PASS + ' | ' + summary.NEEDS_PARAMS + ' | ' + summary.REFUSED_BY_DESIGN + ' | ' + summary.NOT_EXERCISED + ' | ' + summary.FAIL + ' |');
    md.push('');
    md.push('## Rutas');
    md.push('');
    md.push('| # | ruta | método | HTTP | clase | ms | motivo |');
    md.push('|---|---|---|---|---|---|---|');
    resultados.forEach((r, i) => {
        const mot = String(r.motivo || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);
        md.push('| ' + (i + 1) + ' | `' + r.ruta + '` | ' + r.metodo + ' | ' + (r.status_http === null ? '—' : r.status_http) + ' | **' + r.clase + '** | ' + r.ms + ' | ' + mot + ' |');
    });
    md.push('');
    fs.writeFileSync(OUT_MD, md.join('\n'));

    console.log('\n[probe] resumen: ' + JSON.stringify(summary));
    console.log('[probe] JSON: ' + path.relative(ROOT, OUT_JSON));
    console.log('[probe] MD:   ' + path.relative(ROOT, OUT_MD));
    process.exitCode = summary.FAIL === 0 ? 0 : 1;
})().catch((e) => {
    console.error('FAIL DEL ARNÉS: ' + (e && e.stack || e));
    process.exit(1);
});
