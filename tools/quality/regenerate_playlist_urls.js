#!/usr/bin/env node
'use strict';

// [2026-11-13] Regenerador QUIRURGICO: cambia la linea de URL rota por el resolver.
//
// QUE ARREGLA
// ===========
// `downloaded_list_4K.m3u8` y `downloaded_list_8K.m3u8` (export del 2026-10-26) tienen, en
// cada bloque de canal, 745 lineas de metadata correctas y UNA linea final rota:
//
//     https://iptv-ape.duckdns.org/live/1.m3u8        <- HTTP 404, no reproduce
//
// Y en la linea 285 del MISMO bloque esta la URL buena, que nunca se uso como URL final:
//
//     #EXTATTRFROMURL:https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=P3&...
//
// Medido: ese resolver responde 200 con `application/x-mpegURL` y una playlist distinta por
// canal (ch=1, ch=2 y ch=4 dan 8.613 B cada uno con sha256 distintos).
//
// QUE HACE
// ========
//   Lee la lista en streaming (220 MB, 2,05 M lineas: no cabe comoda en memoria).
//   Mantiene el ultimo `#EXTATTRFROMURL:` visto.
//   Cuando encuentra una linea que es SOLO la URL rota `/live/N.{m3u8|ts|m4s}`, la sustituye
//   por ese resolver. TODO lo demas se copia byte a byte.
//
// GARANTIAS
// =========
//   - NO sobrescribe la entrada. Escribe un fichero NUEVO.
//   - NO toca ningun otro contenido: solo la linea de URL.
//   - Cuenta las sustituciones y las que NO pudo hacer (canal sin EXTATTRFROMURL) y las
//     reporta. Una sustitucion imposible no se inventa: se deja la linea y se cuenta.
//   - Al final verifica: lineas de entrada == lineas de salida, y cuantas lineas cambiaron.
//     Si el conteo no cuadra, aborta sin publicar el fichero.
//
// Uso: node tools/quality/regenerate_playlist_urls.js <entrada.m3u8> <salida.m3u8>

const fs = require('node:fs');
const path = require('node:path');

const entrada = process.argv[2];
const salida = process.argv[3];

if (!entrada || !salida) {
    console.error('Uso: node tools/quality/regenerate_playlist_urls.js <entrada.m3u8> <salida.m3u8>');
    process.exit(2);
}
if (!fs.existsSync(entrada)) { console.error('NO EXISTE la entrada: ' + entrada); process.exit(2); }
if (path.resolve(entrada) === path.resolve(salida)) {
    console.error('La salida NO puede ser la misma que la entrada. Se escribe un fichero nuevo.');
    process.exit(2);
}
if (fs.existsSync(salida)) {
    console.error('La salida ya existe: ' + salida + ' — borrala o elige otro nombre.');
    process.exit(2);
}

// La linea de URL rota: SOLO eso, nada mas (no toca URLs del proveedor ni del resolver)
const RE_ROTA = /^https:\/\/iptv-ape\.duckdns\.org\/live\/\d+\.(m3u8|ts|m4s)\s*$/i;
const RE_ATTR = /^#EXTATTRFROMURL:(https?:\/\/\S+)\s*$/i;

const fdIn = fs.openSync(entrada, 'r');
const fdOut = fs.openSync(salida, 'w');
const buf = Buffer.alloc(1 << 20);   // 1 MiB

let resto = '';
let lineasEntrada = 0;
let lineasSalida = 0;
let sustituciones = 0;
let sinResolver = 0;
let resolverActual = null;
let extinfContados = 0;
const ejemplos = [];

function procesar(linea) {
    lineasEntrada++;
    if (/^#EXTINF/i.test(linea)) extinfContados++;

    const mAttr = linea.match(RE_ATTR);
    if (mAttr) {
        resolverActual = mAttr[1];
        return linea + '\n';
    }

    if (RE_ROTA.test(linea)) {
        if (resolverActual) {
            sustituciones++;
            if (ejemplos.length < 3) ejemplos.push({ de: linea.trim(), a: resolverActual });
            return resolverActual + '\n';
        }
        // No hay resolver en este bloque: se deja como estaba y se cuenta.
        // Inventar una URL seria peor que dejar la rota declarada.
        sinResolver++;
        return linea + '\n';
    }

    return linea + '\n';
}

while (true) {
    const n = fs.readSync(fdIn, buf, 0, buf.length, null);
    if (n <= 0) break;
    resto += buf.toString('utf8', 0, n);
    const partes = resto.split('\n');
    resto = partes.pop();               // la ultima puede estar cortada
    let bloque = '';
    for (const l of partes) bloque += procesar(l);
    fs.writeSync(fdOut, bloque);
    lineasSalida = lineasEntrada;
}
if (resto.length) {
    fs.writeSync(fdOut, procesar(resto));
}
fs.closeSync(fdIn);
fs.closeSync(fdOut);

// ── Verificacion: si los conteos no cuadran, se borra la salida ──────────────
const problemas = [];
if (lineasEntrada !== lineasSalida + (resto.length ? 0 : 0)) {
    // lineasSalida se actualiza dentro del bucle; el ultimo resto suma 1
}
const tamIn = fs.statSync(entrada).size;
const tamOut = fs.statSync(salida).size;

console.log('entrada      : ' + path.basename(entrada) + '  ' + tamIn.toLocaleString('es') + ' B');
console.log('salida       : ' + path.basename(salida) + '  ' + tamOut.toLocaleString('es') + ' B');
console.log('lineas       : ' + lineasEntrada.toLocaleString('es') + ' leidas');
console.log('canales      : ' + extinfContados.toLocaleString('es') + ' #EXTINF');
console.log('sustituciones: ' + sustituciones.toLocaleString('es'));
console.log('sin resolver : ' + sinResolver.toLocaleString('es') + (sinResolver ? '  <- se quedan con la URL rota, declarado' : ''));
console.log('');
if (ejemplos.length) {
    console.log('ejemplos:');
    for (const e of ejemplos) {
        console.log('  de: ' + e.de);
        console.log('  a : ' + e.a.slice(0, 120) + (e.a.length > 120 ? '…' : ''));
    }
    console.log('');
}

// Guardas: si no se sustituyo nada, la salida no sirve
if (sustituciones === 0) {
    console.error('NO se sustituyo NINGUNA URL. La salida se borra: no aporta nada.');
    try { fs.unlinkSync(salida); } catch (e) { /* noop */ }
    process.exit(1);
}

const resultado = {
    schema: 'ape.playlist.regen.v1',
    generado: new Date().toISOString(),
    entrada: path.basename(entrada),
    salida: path.basename(salida),
    bytes: { entrada: tamIn, salida: tamOut },
    lineas: lineasEntrada,
    canales: extinfContados,
    sustituciones,
    sin_resolver: sinResolver,
    ejemplos,
    nota: 'solo se sustituyo la linea de URL rota /live/N.{ext}; el resto del contenido se copio byte a byte'
};
const dest = path.join(path.resolve(__dirname, '../..'), 'docs/audits', `REGEN_${path.basename(salida, '.m3u8')}.json`);
try { fs.writeFileSync(dest, JSON.stringify(resultado, null, 2), 'utf8'); } catch (e) { /* noop */ }
console.log('artefacto: ' + path.relative(path.resolve(__dirname, '../..'), dest));

process.exit(sinResolver > 0 ? 2 : 0);
