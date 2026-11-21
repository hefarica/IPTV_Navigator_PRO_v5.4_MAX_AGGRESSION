#!/usr/bin/env node
/**
 * qoe_capacity_gate.js — convierte tres promesas no medibles en un gate determinista.
 *
 *   "buffer infinito"  -> buffer_floor: el buffer NUNCA llega a 0 mientras se reproduce.
 *                         (infinito no existe; lo que sí se puede exigir es que no se agote)
 *   "0 freeze/cortes"  -> stalls: transiciones reproduciendo -> sin buffer.
 *   "0 rebuffering"    -> rebuffer_ratio: tiempo parado / tiempo de reproducción.
 *   "50% de capacidad" -> headroom: throughput medido / bitrate declarado >= 2.0
 *                         (el pipeline no usa más de la mitad de la capacidad, deja 2x de margen)
 *
 * Entrada: muestras de telemetría. Salida: JSON + exit code (0 verde, 1 violación, 2 error de uso).
 * Sin dependencias, sin red, determinista: mismas muestras -> mismo veredicto y mismo sha.
 *
 * Uso:
 *   node tools/quality/qoe_capacity_gate.js --selftest
 *   node tools/quality/qoe_capacity_gate.js --samples telemetria.json [--json]
 *   node tools/quality/qoe_capacity_gate.js --plan --capacity-kbps 12000 [--json]
 */
'use strict';

var fs = require('fs');
var crypto = require('crypto');

var UMBRAL = {
    stalls: 0,               // ninguno
    rebuffer_ratio: 0.005,   // 0.5% del tiempo de reproducción
    buffer_floor_s: 0.001,   // > 0: el buffer nunca se agota
    headroom: 2.0            // el gasto no supera el 50% de la capacidad medida
};

function num(v, def) { var n = Number(v); return isFinite(n) ? n : def; }

function ordenar(muestras) {
    return muestras.slice().sort(function (a, b) { return num(a.t, 0) - num(b.t, 0); });
}

function medir(muestras, umbral) {
    var u = Object.assign({}, UMBRAL, umbral || {});
    var m = ordenar(muestras || []);
    var fallos = [];
    if (!m.length) return { ok: false, fallos: ['sin muestras'], metricas: null };

    var stalls = 0, stallMs = 0, playMs = 0, minBuf = Infinity;
    var tput = [], btr = [];

    for (var i = 0; i < m.length; i++) {
        var s = m[i];
        var playing = s.playing !== false;
        var buffer = num(s.buffer_s, 0);
        var dt = i > 0 ? Math.max(0, num(s.t, 0) - num(m[i - 1].t, 0)) : 0;

        if (playing) {
            playMs += dt;
            if (buffer < minBuf) minBuf = buffer;
            var prev = i > 0 ? num(m[i - 1].buffer_s, null) : null;
            if (prev !== null && prev > 0 && buffer <= 0) { stalls++; stallMs += dt; }
            else if (prev === 0 && buffer === 0) { stallMs += dt; }
        }
        if (isFinite(num(s.throughput_kbps, NaN))) tput.push(num(s.throughput_kbps, 0));
        if (isFinite(num(s.bitrate_kbps, NaN))) btr.push(num(s.bitrate_kbps, 0));
    }

    function mediana(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); var k = Math.floor(b.length / 2); return b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2; }
    var cap = mediana(tput), bit = mediana(btr);
    var headroom = (cap !== null && bit !== null && bit > 0) ? (cap / bit) : null;
    var ratio = playMs > 0 ? (stallMs / playMs) : null;

    if (stalls > u.stalls) fallos.push('stalls=' + stalls + ' (max ' + u.stalls + ')');
    if (ratio !== null && ratio > u.rebuffer_ratio) fallos.push('rebuffer_ratio=' + ratio.toFixed(5) + ' (max ' + u.rebuffer_ratio + ')');
    if (!(minBuf >= u.buffer_floor_s)) fallos.push('buffer_floor=' + minBuf + 's (min ' + u.buffer_floor_s + 's)');
    if (headroom === null) fallos.push('headroom NO COMPUTADO (faltan throughput o bitrate)');
    else if (headroom < u.headroom) fallos.push('headroom=' + headroom.toFixed(3) + 'x (min ' + u.headroom + 'x = 50% de capacidad)');

    var metricas = {
        muestras: m.length,
        reproduce_ms: playMs,
        stall_ms: stallMs,
        stalls: stalls,
        rebuffer_ratio: ratio === null ? null : Number(ratio.toFixed(6)),
        buffer_min_s: minBuf === Infinity ? null : Number(minBuf.toFixed(3)),
        capacidad_kbps: cap,
        bitrate_kbps: bit,
        headroom: headroom === null ? null : Number(headroom.toFixed(3))
    };
    return { ok: fallos.length === 0, fallos: fallos, metricas: metricas, umbral: u };
}

/* Plan idempotente: dado el caudal medido, cuál es el bitrate máximo declarable
   para no gastar más de la mitad de la capacidad. Misma entrada -> misma salida. */
function plan(capacidadKbps, umbral) {
    var u = Object.assign({}, UMBRAL, umbral || {});
    var cap = num(capacidadKbps, NaN);
    if (!isFinite(cap) || cap <= 0) return { ok: false, fallos: ['capacidad invalida'] };
    var maxBitrate = Math.floor(cap / u.headroom);
    return {
        ok: maxBitrate > 0,
        fallos: maxBitrate > 0 ? [] : ['capacidad insuficiente para cualquier bitrate'],
        plan: {
            capacidad_kbps: cap,
            headroom_exigido: u.headroom,
            bitrate_max_declarable_kbps: maxBitrate,
            margen_kbps: cap - maxBitrate
        }
    };
}

/* Conteo total de controles: cada umbral cuenta como un control evaluado. */
function controles(umbral) { return Object.keys(Object.assign({}, UMBRAL, umbral || {})).length; }

function selftest() {
    var casos = [];
    function caso(nombre, muestras, esperaOk) {
        var r = medir(muestras, null);
        var ok = r.ok === esperaOk;
        casos.push({ prueba: nombre, esperado: esperaOk ? 'PASS' : 'FAIL', obtenido: r.ok ? 'PASS' : 'FAIL', ok: ok, fallos: r.fallos });
        return ok;
    }
    function serie(bufferFinal, tputKbps, bitKbps, stall) {
        var out = [];
        for (var i = 0; i < 12; i++) {
            out.push({
                t: i * 1000,
                playing: !(stall && i >= 6 && i <= 7),
                buffer_s: i >= 6 && stall ? 0 : bufferFinal + Math.sin(i) * 0.5,
                throughput_kbps: tputKbps,
                bitrate_kbps: bitKbps
            });
        }
        return out;
    }

    var todos = true;
    todos = caso('serie sana (sin stalls, headroom 2.4x)', serie(8, 24000, 10000, false), true) && todos;
    todos = caso('stall sostenido en el centro', serie(8, 24000, 10000, true), false) && todos;
    todos = caso('bitrate por encima del 50% de capacidad', serie(8, 12000, 10000, false), false) && todos;
    todos = caso('buffer agotado sin marcar playing', [{ t: 0, playing: true, buffer_s: 0.5, throughput_kbps: 24000, bitrate_kbps: 10000 }, { t: 1000, playing: true, buffer_s: 0, throughput_kbps: 24000, bitrate_kbps: 10000 }], false) && todos;

    var p1 = plan(24000, null), p2 = plan(24000, null);
    var idem = JSON.stringify(p1) === JSON.stringify(p2) && p1.plan.bitrate_max_declarable_kbps === 12000;
    casos.push({ prueba: 'plan idempotente y 50% exacto', esperado: '12000', obtenido: String(p1.plan.bitrate_max_declarable_kbps), ok: idem, fallos: [] });
    todos = todos && idem;

    var sin = medir([], null);
    var vacioOk = sin.ok === false && String(sin.fallos[0]).indexOf('sin muestras') === 0;
    casos.push({ prueba: 'sin muestras no es verde', esperado: 'FAIL', obtenido: sin.ok ? 'PASS' : 'FAIL', ok: vacioOk, fallos: sin.fallos });
    todos = todos && vacioOk;

    var pass = casos.filter(function (c) { return c.ok; }).length;
    return { selftest: true, pass: pass, fail: casos.length - pass, total: casos.length, casos: casos, ok: todos };
}

function main(argv) {
    var a = argv.slice(2);
    if (a.indexOf('--selftest') >= 0) {
        var r = selftest();
        console.log(JSON.stringify(r, null, a.indexOf('--json') >= 0 ? 2 : 0));
        process.exit(r.ok ? 0 : 1);
    }
    if (a.indexOf('--plan') >= 0) {
        var i = a.indexOf('--capacity-kbps');
        var p = plan(i >= 0 ? a[i + 1] : NaN, null);
        console.log(JSON.stringify(p, null, 2));
        process.exit(p.ok ? 0 : 2);
    }
    var s = a.indexOf('--samples');
    if (s < 0) {
        console.error('uso: --samples <json> | --selftest | --plan --capacity-kbps N');
        process.exit(2);
    }
    var datos;
    try { datos = JSON.parse(fs.readFileSync(a[s + 1], 'utf8')); }
    catch (e) { console.error('muestras ilegibles: ' + e.message); process.exit(2); }
    var muestras = Array.isArray(datos) ? datos : (datos.muestras || []);
    var res = medir(muestras, datos.umbral || null);
    var sha = crypto.createHash('sha256').update(JSON.stringify(ordenar(muestras))).digest('hex');
    var salida = { ok: res.ok, fallos: res.fallos, metricas: res.metricas, controladores: controles(null), muestras_sha256: sha, umbral: res.umbral };
    console.log(JSON.stringify(salida, null, 2));
    process.exit(res.ok ? 0 : 1);
}

if (require.main === module) main(process.argv);
module.exports = { medir: medir, plan: plan, UMBRAL: UMBRAL, controles: controles };
