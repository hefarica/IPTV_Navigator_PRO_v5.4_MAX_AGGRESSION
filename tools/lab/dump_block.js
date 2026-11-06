#!/usr/bin/env node
/**
 * dump_block.js — extrae el bloque COMPLETO de un canal, sin quitar una sola linea.
 *
 * POR QUE EXISTE
 *   Para diagnosticar "Loaded playlist has unexpected type" hay que ver TODO lo que el player
 *   recibe para ese canal: cada tag, en su orden, incluidas las lineas que parecen ruido. Un
 *   parser que se salta lineas se pierde justo la que rompe.
 *
 * Uso:
 *   node tools/lab/dump_block.js --file <lista.m3u8> --id 569289 [--out bloque.txt]
 *   node tools/lab/dump_block.js --file <lista> --name "BUNDESLIGA REPLAY 2"
 */

'use strict';

const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const ID = get('--id');
const NAME = get('--name');
const OUT = get('--out');

if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file con un fichero existente'); process.exit(2); }
if (!ID && !NAME) { console.error('falta --id o --name'); process.exit(2); }

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    let n = 0;
    let capturando = false;
    let bloque = [];
    let encontrado = 0;
    let lineasAntes = 0;

    const coincide = (l) => {
        if (ID && l.includes('tvg-id="' + ID + '"')) return true;
        if (NAME && l.includes(NAME)) return true;
        return false;
    };

    for await (const linea of rl) {
        n++;
        if (linea.startsWith('#EXTINF')) {
            if (capturando) { break; }          // el siguiente canal cierra el bloque
            if (coincide(linea)) {
                capturando = true;
                encontrado++;
                bloque.push(linea);
                continue;
            }
        }
        if (capturando) { bloque.push(linea); }
        else { lineasAntes = n; }
    }

    if (!bloque.length) {
        console.error('canal no encontrado (id=' + (ID || '-') + ', name=' + (NAME || '-') + ')');
        process.exit(1);
    }

    console.log('=== bloque del canal ===');
    console.log('  fichero      : ' + FILE);
    console.log('  empieza en   : linea ' + lineasAntes + '..' + (lineasAntes + bloque.length));
    console.log('  lineas bloque: ' + bloque.length);
    console.log('');

    // censo completo del bloque: cuantos tags de cada tipo, sin omitir ninguno
    const tipos = new Map();
    for (const l of bloque) {
        let k;
        if (l.startsWith('#EXTINF')) k = '#EXTINF';
        else if (l.startsWith('#')) { const m = l.match(/^(#[^:=]*)/); k = m ? m[1] : '#?'; }
        else if (/^https?:\/\//.test(l)) k = 'URL';
        else k = '(vacia)';
        tipos.set(k, (tipos.get(k) || 0) + 1);
    }
    console.log('=== censo del bloque: ' + tipos.size + ' tipos ===');
    [...tipos.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
        console.log('  ' + String(v).padStart(4) + '  ' + k);
    });
    console.log('');

    if (OUT) {
        fs.writeFileSync(OUT, bloque.join('\n') + '\n', 'utf8');
        console.log('  bloque completo escrito en: ' + OUT);
    } else {
        console.log('=== CONTENIDO COMPLETO (nada omitido) ===');
        bloque.forEach((l, i) => console.log(String(i + 1).padStart(4) + '  ' + l));
    }
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
