#!/usr/bin/env node
/**
 * scope_check.js — verifica si dos lineas de un JS quedan en el MISMO scope de
 * llaves. node -c NO detecta una referencia fuera de scope (es error runtime),
 * asi que hay que comprobarlo antes de mover una variable.
 *
 * Tokeniza de forma simple, ignorando strings, template literals y comentarios,
 * y devuelve la profundidad de llaves en cada linea pedida.
 *
 * Uso: node tools/lab/scope_check.js --file <js> --a 10737 --b 12481
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const A = parseInt(get('--a') || '0', 10);
const B = parseInt(get('--b') || '0', 10);
if (!FILE || !A || !B) { console.error('falta --file --a --b'); process.exit(2); }

const src = fs.readFileSync(FILE, 'utf8');

// Recorre caracter por caracter llevando estado de string/comment/template/regex.
let depth = 0;
let i = 0;
let line = 1;
const depthAtLine = new Map();   // linea -> profundidad AL EMPEZAR la linea
depthAtLine.set(1, 0);

const push = (c) => { if (c === '\n') { line++; depthAtLine.set(line, depth); } };

while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];

    // comentario de linea
    if (c === '/' && n === '/') {
        while (i < src.length && src[i] !== '\n') { push(src[i]); i++; }
        continue;
    }
    // comentario de bloque
    if (c === '/' && n === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { push(src[i]); i++; }
        i += 2;
        continue;
    }
    // string simple o doble
    if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i++;
        while (i < src.length) {
            if (src[i] === '\\') { push(src[i]); i++; push(src[i]); i++; continue; }
            if (src[i] === q) { push(src[i]); i++; break; }
            push(src[i]); i++;
        }
        continue;
    }
    if (c === '{') { depth++; push(c); i++; continue; }
    if (c === '}') { depth--; push(c); i++; continue; }
    push(c); i++;
}

const dA = depthAtLine.get(A);
const dB = depthAtLine.get(B);
console.log('archivo          : ' + FILE);
console.log('linea ' + A + '  profundidad al empezar: ' + dA);
console.log('linea ' + B + '  profundidad al empezar: ' + dB);
console.log('');
if (dA === undefined || dB === undefined) {
    console.log('NO COMPUTADO: una de las lineas cae fuera del tokenizador.');
    process.exit(1);
}
// Mismo scope si ambas lineas empiezan a la misma profundidad Y entre ellas la
// profundidad nunca baja por debajo (lo que cerraria el bloque de A).
let minBetween = dA;
for (let L = A; L <= B; L++) {
    const d = depthAtLine.get(L);
    if (d !== undefined && d < minBetween) minBetween = d;
}
// Una variable declarada en A (profundidad dA) es visible en B si el bloque de A
// NO se cerro antes de B. Eso ocurre cuando el minimo de profundidad entre A y B
// no baja de dA. Ojo: dB > dA es VALIDO (B esta en un bloque interno de A); la
// regla vieja `dA === dB && min >= dA` daba un falso negativo en ese caso.
console.log('minimo entre ' + A + ' y ' + B + ' : ' + minBetween);
if (minBetween >= dA) {
    console.log('VEREDICTO: VISIBLE — el bloque de ' + A + ' sigue abierto en ' + B +
        (dB > dA ? ' (B esta ' + (dB - dA) + ' nivel/es mas adentro).' : ' (mismo nivel).'));
} else {
    console.log('VEREDICTO: NO VISIBLE — el bloque de ' + A + ' se cierra antes de ' + B +
        ' (la profundidad baja a ' + minBetween + ' < ' + dA + ').');
}
