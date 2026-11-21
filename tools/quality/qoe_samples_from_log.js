#!/usr/bin/env node
/* Convierte access.log + lineas #EXT-X-STREAM-INF en muestras para qoe_capacity_gate.js.
   Solo mide lo que el log puede probar: caudal (bytes/tiempo) y bitrate declarado.
   Los stalls NO se derivan de un log de acceso: se marcan como no computados por el gate. */
'use strict';
var fs = require('fs'), path = require('path');
var dir = process.argv[2] || '.';
function leer(f) { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } }
var log = leer('access.log').split('\n');
var inf = leer('streaminf.txt');
var bw = (inf.match(/BANDWIDTH=(\d+)/g) || []).map(function (s) { return Number(s.split('=')[1]); });
var declarado = bw.length ? Math.max.apply(null, bw) : null;
var muestras = [], t = 0;
log.forEach(function (line) {
    var m = line.match(/body_bytes_sent=(\d+).*request_time=([\d.]+)/) || line.match(/(\d{3,})\s+([\d.]+)\s*$/);
    if (!m) return;
    var bytes = Number(m[1]), secs = Math.max(0.001, Number(m[2]));
    t += 1000;
    muestras.push({ t: t, playing: true, throughput_kbps: (bytes * 8 / 1000) / secs, bitrate_kbps: declarado });
});
var salida = { muestras: muestras, declarado_kbps: declarado, validas: muestras.length };
fs.writeFileSync(path.join(dir, 'samples.json'), JSON.stringify(salida));
console.log('muestras=' + muestras.length + ' bitrate_declarado_kbps=' + declarado);
process.exit(muestras.length > 0 && declarado ? 0 : 1);