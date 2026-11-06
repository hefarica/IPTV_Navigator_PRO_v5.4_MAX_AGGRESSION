#!/usr/bin/env node
/**
 * fix_network_caching.js — alinea network-caching con live-caching por canal
 *
 * EL DEFECTO QUE CORRIGE, medido
 *   En APE_LISTA_1793903263042.m3u8 los 10.573 canales declaran network-caching=500 ms
 *   mientras su live-caching es 52.000, 55.000 o 72.000 ms segun el perfil. VLC usa
 *   network-caching para el buffer de red real: con 500 ms, un hipo de red de un segundo
 *   congela el canal. La lista de referencia (APE_LISTA_1793589060441.m3u8) si tiene
 *   52.000/55.000/72.000 en network-caching, y por eso esa lista aguanta.
 *
 * QUE HACE
 *   Para cada bloque de canal, toma el valor de live-caching y lo escribe tambien en
 *   network-caching. Asi se conserva el escalado por perfil que ya existe (52 s en P4,
 *   55 s en P3, 72 s en P1) sin inventar ningun numero: el valor ya esta en el propio canal.
 *
 * QUE NO HACE
 *   No toca video-filter, HDR, resoluciones, BANDWIDTH, ni ningun otro campo. No reordena
 *   lineas. No elimina nada. Copia el fichero linea a linea y solo sustituye el valor de
 *   network-caching cuando encuentra el live-caching de su bloque.
 *
 *   Si un bloque no tiene live-caching, su network-caching se deja como esta y se cuenta:
 *   mejor no tocar que rellenar con un valor supuesto.
 *
 * Uso:
 *   node tools/lab/fix_network_caching.js --in <lista.m3u8> --out <salida.m3u8> [--dry]
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const IN = get('--in');
const OUT = get('--out');
const DRY = args.indexOf('--dry') >= 0;

if (!IN || !fs.existsSync(IN)) { console.error('falta --in con un fichero existente'); process.exit(2); }
if (!DRY && !OUT) { console.error('falta --out (o usa --dry)'); process.exit(2); }

function sha256File(p) {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(1 << 20);
    let pos = 0, n;
    while ((n = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, n)); pos += n; }
    fs.closeSync(fd);
    return h.digest('hex');
}

(async () => {
    console.log('=== FUENTE ===');
    const st = fs.statSync(IN);
    console.log('  fichero: ' + IN);
    console.log('  bytes  : ' + st.size);
    const shaIn = sha256File(IN);
    console.log('  sha256 : ' + shaIn);

    const out = DRY ? null : fs.createWriteStream(OUT);
    const rl = readline.createInterface({
        input: fs.createReadStream(IN, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    let lineas = 0, canales = 0, cambios = 0, sinLive = 0, yaIgual = 0;
    let enBloque = false;
    // buffer del bloque: se vacia al empezar el siguiente bloque o al final
    let bloque = [];
    let liveCaching = null;

    const vaciar = () => {
        if (!bloque.length) return;
        if (liveCaching !== null) {
            for (let i = 0; i < bloque.length; i++) {
                const m = bloque[i].match(/^(#EXTVLCOPT:network-caching=)(\d+)(.*)$/);
                if (m) {
                    if (m[2] === liveCaching) { yaIgual++; }
                    else { bloque[i] = m[1] + liveCaching + m[3]; cambios++; }
                }
            }
            if (!bloque.some(l => /^#EXTVLCOPT:network-caching=/.test(l))) sinLive++;
        } else {
            if (bloque.some(l => /^#EXTVLCOPT:network-caching=/.test(l))) sinLive++;
        }
        if (out) out.write(bloque.join('\n') + '\n');
        bloque = [];
        liveCaching = null;
    };

    for await (const linea of rl) {
        lineas++;
        if (linea.startsWith('#EXTINF')) {
            vaciar();
            canales++;
            enBloque = true;
            bloque.push(linea);
            continue;
        }
        if (!enBloque) {           // cabecera del fichero
            if (out) out.write(linea + '\n');
            continue;
        }
        const m = linea.match(/^#EXTVLCOPT:live-caching=(\d+)/);
        if (m) liveCaching = m[1];
        bloque.push(linea);
    }
    vaciar();
    if (out) { out.end(); await new Promise(r => out.on('close', r)); }

    console.log('');
    console.log('=== RESULTADO ===');
    console.log('  lineas leidas        : ' + lineas);
    console.log('  canales              : ' + canales);
    console.log('  network-caching reescrito : ' + cambios);
    console.log('  ya coincidian        : ' + yaIgual);
    console.log('  bloques sin live-caching (intactos): ' + sinLive);
    console.log('');
    if (DRY) {
        console.log('  (dry run: no se escribio nada)');
    } else {
        const stO = fs.statSync(OUT);
        const shaOut = sha256File(OUT);
        console.log('  salida  : ' + OUT);
        console.log('  bytes   : ' + stO.size + '  (origen ' + st.size + ', delta ' + (stO.size - st.size) + ')');
        console.log('  sha256  : ' + shaOut);
        console.log('');
        console.log('  VERIFICACION DE INTEGRIDAD');
        // el numero de lineas debe ser identico y el delta de bytes debe ser explicable
        console.log('    delta de bytes esperado = cambios x (digitos nuevos - digitos viejos)');
        console.log('    cambios=' + cambios + ', yaIgual=' + yaIgual + ', sinLive=' + sinLive);
        console.log('    canales con network-caching reescrito: ' + cambios + '/' + canales);
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
