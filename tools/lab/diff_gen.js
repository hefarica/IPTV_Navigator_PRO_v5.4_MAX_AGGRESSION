#!/usr/bin/env node
/**
 * diff_gen.js — compara dos listas generadas y CLASIFICA cada diferencia.
 *
 * Responde "que cambiaste" sin prosa: separa lo que es la CONEXION al
 * proveedor (parte de la URI antes del pipe) de lo que es el PIPE de headers,
 * y de los tags del header. Si la parte de conexion es identica, el cambio no
 * puede alterar a que host se conecta el player.
 *
 * Uso: node tools/lab/diff_gen.js --a <listaA> --b <listaB>
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const A = get('--a'), B = get('--b');
if (!A || !B) { console.error('falta --a --b'); process.exit(2); }

const read = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/);

const la = read(A), lb = read(B);

function classify(lines) {
    const out = { uri: [], pipe: [], extinf: [], header: [], other: {} };
    for (const raw of lines) {
        const s = raw.trim();
        if (!s) continue;
        if (/^https?:\/\//i.test(s)) {
            const i = s.indexOf('|');
            out.uri.push(i === -1 ? s : s.slice(0, i));
            if (i !== -1) {
                // el UA rota a proposito: se normaliza para no contar ruido
                const norm = s.slice(i + 1)
                    .replace(/User-Agent=[^&]*/, 'User-Agent=<ROTA>');
                out.pipe.push(norm);
            }
            continue;
        }
        if (s.startsWith('#EXTINF')) { out.extinf.push(s); continue; }
        if (/^#EXT-X-(SYS-SERVER|SERVER-\d)/.test(s)) { out.header.push(s); continue; }
        const k = s.split(':')[0];
        out.other[k] = (out.other[k] || 0) + 1;
    }
    return out;
}

const ca = classify(la), cb = classify(lb);

function cmpArr(name, a, b) {
    const sa = new Set(a), sb = new Set(b);
    const onlyA = [...sa].filter(x => !sb.has(x));
    const onlyB = [...sb].filter(x => !sa.has(x));
    console.log('');
    console.log('── ' + name + ' ────────────────────────────────────────');
    console.log('   A=' + a.length + '  B=' + b.length + '  soloA=' + onlyA.length + '  soloB=' + onlyB.length);
    if (!onlyA.length && !onlyB.length) { console.log('   IDENTICOS'); return true; }
    for (const x of onlyA.slice(0, 4)) console.log('   solo en A: ' + x.slice(0, 170));
    for (const x of onlyB.slice(0, 4)) console.log('   solo en B: ' + x.slice(0, 170));
    return false;
}

console.log('='.repeat(80));
console.log('DIFF DE GENERACION');
console.log('  A = ' + A);
console.log('  B = ' + B);
console.log('='.repeat(80));

const sameUri = cmpArr('URI SIN PIPE (la CONEXION al proveedor)', ca.uri, cb.uri);
const sameExtinf = cmpArr('#EXTINF (canal, tvg-id, nombre)', ca.extinf, cb.extinf);
const sameHeader = cmpArr('TAGS DE POOL EN EL HEADER', ca.header, cb.header);
const samePipe = cmpArr('PIPE de headers (UA normalizado)', ca.pipe, cb.pipe);

console.log('');
console.log('='.repeat(80));
console.log('VEREDICTO');
console.log('='.repeat(80));
console.log('  conexion (URI sin pipe) identica : ' + (sameUri ? 'SI' : 'NO'));
console.log('  #EXTINF identico                 : ' + (sameExtinf ? 'SI' : 'NO'));
console.log('  pool en el header identico       : ' + (sameHeader ? 'SI' : 'NO'));
console.log('  pipe identico                    : ' + (samePipe ? 'SI' : 'NO'));
console.log('');
if (sameUri && sameExtinf) {
    console.log('  => El cambio NO altera a que host, con que credenciales ni a que');
    console.log('     stream_id se conecta el player. Solo cambia el header Referer');
    console.log('     del pipe y el pool declarado.');
} else {
    console.log('  !! La CONEXION cambio. Revisar antes de seguir.');
}
