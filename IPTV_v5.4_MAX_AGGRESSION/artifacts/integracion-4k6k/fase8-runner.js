#!/usr/bin/env node
/**
 * Runner endurecido (fase 8). Requisitos que cumple, uno por uno:
 *  · confinamiento de rutas al frontend del staging (resolve + startsWith)
 *  · rutas sensibles con token de sesión temporal, validación de Origin y límites
 *  · escritura con streaming y backpressure; sin sobrescribir evidencias (sufijo)
 *  · validación de IDs exactos (P0..P5, P0.5..P5.5)
 *  · sha256 calculado al vuelo y VERIFICADO releyendo el archivo
 *  · finalización verificable: cada generación se correlaciona con su blob por promesa
 *  · fallo con exit != 0 ante timeout, Chrome caído, marcador ausente, filas
 *    incompletas o aserciones incumplidas
 *  · bind exclusivo 127.0.0.1, puerto efímero, token obligatorio en /lab.json,
 *    /entrada.m3u8, /guardar y /salida.m3u8
 *
 * Uso: node fase8-runner.js <perfil,perfil,...>
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = 'C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend';
const LAB = 'C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const ENTRADA = 'C:/Users/HFRC/APE_PRIVADO/entrada_3ch.m3u8';
const OUTDIR = 'C:/Users/HFRC/APE_PRIVADO/fase8';
const IDS = new Set(['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']);
const TOKEN = crypto.randomBytes(24).toString('hex');
const ORIGIN_OK = (o) => o === 'http://127.0.0.1' || (typeof o === 'string' && /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(o));
const T0 = Date.now();
const diag = [];
function log(k, v) { diag.push({ t: Date.now() - T0, k: k, v: v }); }

fs.mkdirSync(OUTDIR, { recursive: true });

function confinar(p) {
    const abs = path.resolve(p);
    const base = path.resolve(ROOT);
    if (abs !== base && !abs.startsWith(base + path.sep)) return null;
    return abs;
}

function responder(res, code, tipo, cuerpo) {
    res.writeHead(code, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(cuerpo);
}

const srv = http.createServer((req, res) => {
    let u;
    try { u = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (_) { return responder(res, 400, 'text/plain', 'bad-url'); }

    const esSensible = ['/lab.json', '/entrada.m3u8', '/salida.m3u8', '/guardar'].indexOf(u) >= 0;
    if (esSensible) {
        /* El testigo se acepta por cabecera y, para GET, también por query:
           el navegador no siempre reenvía la cabecera en subrecursos. Sigue
           siendo un secreto aleatorio por corrida, en loopback. */
        var tokH = req.headers['x-ape-token'] || '';
        var tokQ = new URL(req.url, 'http://127.0.0.1').searchParams.get('t') || '';
        if (tokH !== TOKEN && tokQ !== TOKEN) {
            log('rechazo', { u: u, causa: 'token', lenH: tokH.length, lenQ: tokQ.length });
            return responder(res, 401, 'text/plain', 'no');
        }
        const org = req.headers.origin;
        if (org && !ORIGIN_OK(org)) { log('rechazo', { u: u, causa: 'origin', org: org }); return responder(res, 403, 'text/plain', 'no'); }
    }
    if (u === '/guardar' && req.method !== 'POST') return responder(res, 405, 'text/plain', 'no');

    if (u === '/lab.json' || u === '/entrada.m3u8') {
        const f = u === '/lab.json' ? LAB : ENTRADA;
        fs.readFile(f, (e, b) => {
            if (e) { log('lectura_fallo', { f: f }); return responder(res, 404, 'text/plain', 'nf'); }
            responder(res, 200, u === '/lab.json' ? 'application/json' : 'audio/x-mpegurl', b);
        });
        return;
    }
    if (u === '/salida.m3u8') {
        /* se sirve EXACTAMENTE el archivo que /guardar escribió (nombre con epoch) */
        const q = new URL(req.url, 'http://127.0.0.1').searchParams;
        const f = String(q.get('f') || '');
        if (!/^salida_[A-Za-z0-9.]+__\d+\.m3u8$/.test(f)) { log('salida_rechazo', { f: f }); return responder(res, 400, 'text/plain', 'nom'); }
        fs.readFile(path.join(OUTDIR, f), (e, b) => {
            if (e) { log('salida_404', { f: f }); return responder(res, 404, 'text/plain', 'nf'); }
            log('salida_ok', { f: f, bytes: b.length });
            responder(res, 200, 'audio/x-mpegurl', b);
        });
        return;
    }
    if (u === '/guardar') {
        const p = String(req.headers['x-perfil'] || '');
        if (!IDS.has(p)) { log('guardar_rechazo', { p: p }); return responder(res, 400, 'application/json', JSON.stringify({ ok: false, err: 'id' })); }
        /* sin sobrescritura: nombre único por corrida */
        const f = path.join(OUTDIR, 'salida_' + p + '__' + T0 + '.m3u8');
        const h = crypto.createHash('sha256');
        let bytes = 0, cerrado = false;
        const ws = fs.createWriteStream(f, { flags: 'wx' });
        req.on('data', (c) => {
            bytes += c.length; h.update(c);
            if (!ws.write(c)) { req.pause(); ws.once('drain', () => req.resume()); }
        });
        req.on('end', () => {
            ws.end(() => {
                if (cerrado) return; cerrado = true;
                const shaMem = h.digest('hex');
                const buf = fs.readFileSync(f);          /* relectura para verificar */
                const shaDisco = crypto.createHash('sha256').update(buf).digest('hex');
                const ok = shaMem === shaDisco && buf.length === bytes;
                log('guardar', { p: p, bytes: bytes, ok: ok });
                responder(res, ok ? 200 : 500, 'application/json',
                    JSON.stringify({ ok: ok, id: p, bytes: bytes, sha256: shaDisk(shaDisco), archivo: path.basename(f) }));
            });
        });
        req.on('aborted', () => { try { ws.destroy(); } catch (_) {} });
        return;
    }

    const abs = confinar(path.join(ROOT, u));
    if (!abs) { log('fuera_de_root', { u: u }); return responder(res, 403, 'text/plain', 'no'); }
    fs.readFile(abs, (e, b) => {
        if (e) return responder(res, 404, 'text/plain', 'nf');
        const ext = path.extname(abs);
        const tipo = ext === '.js' ? 'application/javascript' : ext === '.json' ? 'application/json'
            : ext === '.css' ? 'text/css' : 'text/html; charset=utf-8';
        responder(res, 200, tipo, b);
    });
});
function shaDisk(h) { return h; }

const PERFILES = (process.argv[2] || 'P0,P3,P2.5').split(',').map(s => s.trim()).filter(Boolean);
if (process.argv.indexOf('--selftest') < 0) {
    for (const p of PERFILES) if (!IDS.has(p)) { console.error('ID invalido: ' + p); process.exit(2); }
}

srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    if (srv.address().address !== '127.0.0.1') { console.error('bind no local'); process.exit(3); }
    /* ── AUTOTEST DE PRIVACIDAD Y CONFINAMIENTO (sin Chrome) ─────────────── */
    if (process.argv.indexOf('--selftest') >= 0) {
        const pedir = (opts, body) => new Promise((res) => {
            const rq = http.request(Object.assign({ host: '127.0.0.1', port: port }, opts), (rs) => {
                let d = ''; rs.on('data', c => d += c); rs.on('end', () => res({ code: rs.statusCode, body: d }));
            });
            rq.on('error', () => res({ code: 0, body: 'conn-error' }));
            if (body) rq.write(body);
            rq.end();
        });
        (async () => {
            const casos = [];
            let a;
            a = await pedir({ path: '/lab.json', method: 'GET' }); casos.push(['lab sin token → 401', a.code === 401, a.code]);
            a = await pedir({ path: '/lab.json', method: 'GET', headers: { 'X-APE-Token': TOKEN } }); casos.push(['lab con token → 200', a.code === 200 && a.body.length > 1000, a.code]);
            a = await pedir({ path: '/lab.json', method: 'GET', headers: { 'X-APE-Token': TOKEN, Origin: 'http://evil.example' } }); casos.push(['origin ajeno → 403', a.code === 403, a.code]);
            a = await pedir({ path: '/../../../../windows/win.ini', method: 'GET' }); casos.push(['traversal → 403/404', a.code === 403 || a.code === 404, a.code]);
            a = await pedir({ path: '/js/../index-v4.html', method: 'GET' }); casos.push(['ruta interna normalizada → 200', a.code === 200, a.code]);
            a = await pedir({ path: '/salida.m3u8?f=../../etc/passwd&t=' + TOKEN, method: 'GET' }); casos.push(['nombre de salida inválido → 400', a.code === 400, a.code]);
            a = await pedir({ path: '/guardar', method: 'POST', headers: { 'X-APE-Token': TOKEN, 'X-Perfil': 'P99' } }, 'x'); casos.push(['id inválido en guardar → 400', a.code === 400, a.code]);
            a = await pedir({ path: '/entrada.m3u8', method: 'GET' }); casos.push(['entrada sin token → 401', a.code === 401, a.code]);
            const fallos = casos.filter(c => !c[1]);
            console.log(JSON.stringify({ selftest: true, casos: casos.map(c => ({ prueba: c[0], ok: c[1], code: c[2] })), fallos: fallos.length }));
            srv.close();
            process.exit(fallos.length === 0 ? 0 : 1);
        })();
        return;
    }
    const url = 'http://127.0.0.1:' + port + '/index-v4.html#ape-e2e&t=' + TOKEN + '&p=' + encodeURIComponent(PERFILES.join(','));
    let buf = '';
    const cp = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
        ['--headless=old', '--disable-gpu', '--no-sandbox', '--no-first-run',
         '--user-data-dir=' + process.env.TEMP + '/chrome-f8-' + T0,
         '--virtual-time-budget=400000', '--dump-dom', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    cp.stdout.on('data', d => { buf += d; });
    cp.on('error', e => { log('chrome_error', String(e.message)); fin(4); });
    let terminado = false;
    const timer = setTimeout(() => { log('timeout', { bytes: buf.length }); fin(5); }, 420000);
    function fin(code) {
        if (terminado) return; terminado = true;
        clearTimeout(timer);
        const i = buf.indexOf('E2E:'), j = buf.indexOf('</pre>', i);
        let R = null, fallos = [];
        if (i < 0 || j < i) fallos.push('marcador ausente');
        else { try { R = JSON.parse(buf.slice(i + 4, j)); } catch (e) { fallos.push('json marcador: ' + e.message); } }
        if (R) {
            if (!Array.isArray(R.filas) || R.filas.length !== PERFILES.length) fallos.push('filas incompletas: ' + (R.filas || []).length + '/' + PERFILES.length);
            if (R.err && R.err.length) fallos.push('errores en pagina: ' + JSON.stringify(R.err));
            for (const f of (R.filas || [])) {
                if (!f.clickVisible || f.clickVisible !== 'ok') fallos.push(f.id + ': sin clic en control visible');
                if (f.perfilCanalAntes !== f.perfilCanalDespues) fallos.push(f.id + ': perfil de canal cambiado');
                if (f.on === 'sin blob') { fallos.push(f.id + ': sin blob (' + (f.motivo || '?') + ')'); continue; }
                if (!f.off || f.off.sidecar !== 0) fallos.push(f.id + ': OFF con sidecar != 0');
                if (!f.on || f.on.sidecar !== 3) fallos.push(f.id + ': ON sin 3 sidecar');
                if (!f.on || f.on.selectedProfile !== f.id) fallos.push(f.id + ': selectedProfile != ' + f.id);
                if (!f.on || !f.on.sha256) fallos.push(f.id + ': sin sha del blob');
                if (!f.export || f.export.ok !== true) fallos.push(f.id + ': export no verificado');
                else {
                    if (f.export.sha256 !== f.on.sha256) fallos.push(f.id + ': sha disco != sha memoria');
                    const ruta = path.join(OUTDIR, f.export.archivo);
                    if (!fs.existsSync(ruta)) fallos.push(f.id + ': archivo ausente ' + f.export.archivo);
                    else {
                        const sha = crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
                        if (sha !== f.export.sha256) fallos.push(f.id + ': relectura sha distinta');
                    }
                }
                /* la reimportacion solo cuenta si de verdad se leyó el archivo exportado */
                if (!f.reimport || f.reimport.bytes <= 1000 || f.reimport.tieneSidecar !== true) fallos.push(f.id + ': reimportacion vacua (bytes=' + (f.reimport && f.reimport.bytes) + ')');
                if (!f.reimport || f.reimport.mismaSecuencia !== true) fallos.push(f.id + ': reimportacion no identica');
                if (f.idempotente !== true) fallos.push(f.id + ': no idempotente');
                if (f.recuperacionExacta !== true) fallos.push(f.id + ': recuperacion no exacta');
            }
        }
        const salida = { ok: fallos.length === 0, perfiles: PERFILES, fallos: fallos, diag: diag, resultado: R };
        console.log(JSON.stringify(salida));
        try { cp.kill('SIGKILL'); } catch (_) {}
        srv.close();
        process.exit(fallos.length === 0 ? 0 : 1);
    }
    cp.on('close', () => { if (!terminado) { log('chrome_close', { bytes: buf.length }); fin(6); } });
});
