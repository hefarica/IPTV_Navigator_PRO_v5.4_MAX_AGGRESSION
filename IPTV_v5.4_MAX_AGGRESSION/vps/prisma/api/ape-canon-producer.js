#!/usr/bin/env node
/**
 * APE CANON PRODUCER (server-side, STREAMING) — cierra Motor 3 E2E.
 * Uso: node ape-canon-producer.js <lista.m3u8> [shmdir=/dev/shm/ape_canon]
 *
 * Lee la lista por STREAMING (readline) — soporta listas MASIVAS (probado: 1GB,
 * 22.595 canales) sin cargar el archivo en un string (límite Node ~512MB). Acumula
 * el bloque de CADA canal (de #EXTINF a #EXTINF) y lo homologa uno a uno (Motor 1),
 * escribiendo /dev/shm/ape_canon/<_key>.json atómico + idempotente. Memoria O(1 canal).
 * Corre EN EL VPS (trusted, sin token). AUTOPISTA: evento de subida, fuera del zap.
 */
'use strict';
var fs = require('fs'), path = require('path'), readline = require('readline');
var H = require('/opt/ape-dual-link/js/ape-field-homologator.js');

// ── AUTO-PROTECCIÓN AUTOPISTA (council S6/S7 2026-06-11): el producer homologa 22.595 canales
//    (~5min CPU). En 3 vCPU compartidos con nginx/PHP del Fire TV, correrlo a prioridad normal
//    disparó load-45 → riesgo de rebuffer. Si NO corre bajo systemd (sin INVOCATION_ID), se RE-EJECUTA
//    acotado vía `systemd-run --scope` (Nice19/idle/CPUQuota50%/MemoryMax512M/ape-background.slice) →
//    el load-45 es IMPOSIBLE aunque alguien lo lance a mano por SSH. Si systemd-run no está, corre directo.
function selfProtect() {
    // Renice a 19 SIEMPRE (robusto, sin dependencia de systemd): el scheduler da prioridad a
    // nginx/PHP del Fire TV, que PREEMPTAN al producer → aunque el load suba, el stream NO sufre.
    // + ionice clase idle (3) para no competir por disco. El CPUQuota/MemoryMax DURO lo añade la unit
    // systemd (ape-canon-watch.service) cuando la dispara el watcher. NUNCA corre a prioridad normal.
    try { var os = require('os'); if (typeof os.setPriority === 'function') os.setPriority(0, 19); }
    catch (e) { /* sin permiso para renice → sigue, la unit systemd lo acota igual */ }
    try { require('child_process').execSync('ionice -c3 -p ' + process.pid, { stdio: 'ignore' }); }
    catch (e) { /* ionice no disponible → best-effort */ }
}

function main() {
    selfProtect();
    var listPath = process.argv[2];
    var shm = process.argv[3] || '/dev/shm/ape_canon';
    if (!listPath || !fs.existsSync(listPath)) { console.error('uso: ape-canon-producer.js <lista.m3u8> [shmdir]'); process.exit(2); }
    fs.mkdirSync(shm, { recursive: true });

    var MAX_TOTAL_BYTES = 256 * 1024 * 1024;   // presupuesto /dev/shm para el canon
    var written = 0, skipped = 0, bad = 0, totalBytes = 0, halted = false;
    var block = [], inChannel = false;

    function slimE(E) {  // SLIM: solo lo que el resolve usa (tóxicos + cubo-E). La lista queda intacta (NO-STRIP); los X-APE-* llegan vivos por el hijack.
        var out = {}; E = E || {};
        Object.keys(E).forEach(function (k) { if (k.indexOf('_toxic.') === 0 || /bypass|sandvine|exploit|spoof|phantom|hydra|circuit-breaker/i.test(k)) out[k] = E[k]; });
        return out;
    }
    function writeRecord(r) {
        if (!r || !r._key) { bad++; return; }
        var key = String(r._key).toLowerCase().replace(/[^a-f0-9]/g, '');
        if (!key) { bad++; return; }
        var wire = { _key: r._key, _schemaFingerprint: r._schemaFingerprint, _provider_url: r._provider_url, B: r.B || {}, C: r.C || {}, D: r.D || {}, E: slimE(r.E) };
        var line = JSON.stringify(wire);
        if (totalBytes + line.length > MAX_TOTAL_BYTES) { halted = true; return; }
        var p = path.join(shm, key + '.json');
        if (fs.existsSync(p)) {
            try { var cur = JSON.parse(fs.readFileSync(p, 'utf8')); if (cur._schemaFingerprint === r._schemaFingerprint && cur._provider_url === r._provider_url) { skipped++; return; } } catch (e) {}
        }
        var tmp = p + '.tmp_' + process.pid;
        try { fs.writeFileSync(tmp, line); fs.renameSync(tmp, p); written++; totalBytes += line.length; }
        catch (e) { try { fs.unlinkSync(tmp); } catch (e2) {} bad++; }
    }

    function flush() {
        if (!block.length) return;
        try {
            var res = H.homologateList(block.join('\n'));   // homologa SOLO este canal
            for (var i = 0; i < res.channels.length; i++) writeRecord(res.channels[i]);
        } catch (e) { bad++; }
        block = [];
    }

    var rl = readline.createInterface({ input: fs.createReadStream(listPath, { encoding: 'utf8' }), crlfDelay: Infinity });
    rl.on('line', function (line) {
        if (halted) return;
        var isExtinf = line.lastIndexOf('#EXTINF', 0) === 0;   // startsWith('#EXTINF')
        if (isExtinf) { if (inChannel) flush(); inChannel = true; block = [line]; return; }
        if (inChannel) block.push(line);
        // líneas antes del primer #EXTINF (cabecera global) se ignoran (no son canal)
    });
    rl.on('close', function () {
        flush();
        console.log(JSON.stringify({ status: halted ? 'partial_budget' : 'ok', written: written, skipped_idempotent: skipped, bad: bad, total_bytes: totalBytes, halted: halted, shm: shm }));
    });
    rl.on('error', function (e) { console.error('read error: ' + e.message); process.exit(1); });
}
main();
