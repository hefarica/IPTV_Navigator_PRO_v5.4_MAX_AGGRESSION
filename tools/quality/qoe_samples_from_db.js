#!/usr/bin/env node
/* Convierte el volcado de conviva.db en muestras para qoe_capacity_gate.js.
   Mapea columnas por nombre y DECLARA lo que no puede probar. Sin datos inventados. */
'use strict';
var fs = require('fs'), path = require('path');
var dir = process.argv[2] || '.';
function leer(f) { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } }
var db;
try { db = JSON.parse(leer('qoe.json')); } catch (e) { console.error('qoe.json ilegible'); process.exit(2); }
if (!db.ok || !db.filas) { console.error('base no legible: ' + JSON.stringify(db.error || null)); process.exit(2); }
var inf = leer('streaminf.txt');
var bw = (inf.match(/BANDWIDTH=(\d+)/g) || []).map(function (s) { return Number(s.split('=')[1]); });
var declarado = bw.length ? Math.max.apply(null, bw) : null;

function buscar(cols, re) { for (var i = 0; i < cols.length; i++) if (re.test(cols[i])) return cols[i]; return null; }
var elegido = null, cols = null, filas = [];
Object.keys(db.filas).forEach(function (t) { if (db.filas[t].length > filas.length) { filas = db.filas[t]; elegido = t; } });
if (!elegido) { console.error('sin filas en las tablas de QoE'); process.exit(1); }
cols = Object.keys(filas[0] || {});
var cCap = buscar(cols, /bitrate|bytes_per|throughput|kbps/i);
var cReb = buscar(cols, /rebuffer|stall/i);
var cPlay = buscar(cols, /play.*(ms|s)$|duration|elapsed/i);
var cTs = buscar(cols, /(^|_)ts$|time|created|fecha/i);

var muestras = [], t = 0, rebTotal = 0, playTotal = 0;
filas.forEach(function (r) {
    t += 1000;
    var cap = cCap ? Number(r[cCap]) : null;
    var reb = cReb ? Number(r[cReb]) : 0;
    var play = cPlay ? Number(r[cPlay]) : 0;
    if (isFinite(reb)) rebTotal += reb;
    if (isFinite(play)) playTotal += play;
    muestras.push({ t: t, playing: true, throughput_kbps: isFinite(cap) && cap > 0 ? cap : null, bitrate_kbps: declarado });
});
var noComputado = [];
if (!cCap) noComputado.push('capacidad (sin columna de bitrate/bytes)');
if (!declarado) noComputado.push('bitrate declarado (sin #EXT-X-STREAM-INF)');
var salida = {
    muestras: muestras, tabla: elegido, columnas: cols,
    mapeo: { capacidad: cCap, rebuffer: cReb, reproduccion: cPlay, marca_tiempo: cTs },
    declarado_kbps: declarado, filas: filas.length,
    rebuffer_total: rebTotal, reproduccion_total: playTotal,
    no_computado: noComputado
};
fs.writeFileSync(path.join(dir, 'samples.json'), JSON.stringify(salida));
console.log(JSON.stringify({ tabla: elegido, filas: filas.length, mapeo: salida.mapeo, declarado_kbps: declarado, no_computado: noComputado }));
process.exit(salida.mapeo.capacidad && declarado ? 0 : 1);