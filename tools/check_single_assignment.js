#!/usr/bin/env node
/**
 * check_single_assignment.js — gate anti "inicialización que pisa el cálculo"
 *
 * QUÉ PROBLEMA RESUELVE
 *   Dos veces seguidas (commits a2a798a2 y dc983153) el nivel de realce de
 *   url2-cartridge.php salió siempre 0 en producción. En ambos casos la causa fue la misma:
 *   un `$apeNivelRealce = 0;` que se ejecutaba DESPUÉS del cálculo y lo borraba.
 *   `php -l` no lo detecta — la sintaxis es válida y el programa corre. El valor simplemente
 *   se descarta, y sólo se ve leyendo la respuesta servida.
 *
 * QUÉ HACE
 *   Analiza las variables de estado de un PHP y falla si una variable recibe:
 *     - más de una asignación literal (`$v = 0;`), o
 *     - una asignación literal que aparece DESPUÉS de una asignación calculada,
 *       sin rama condicional que la justifique.
 *
 * QUÉ NO HACE
 *   No es un parser PHP. No entiende scopes, includes ni evaluación dinámica. Detecta el
 *   patrón concreto que causó el defecto dos veces, y falla cerrado ante ambigüedad.
 *
 * USO
 *   node tools/check_single_assignment.js <fichero.php> [--vars a,b,c]
 *   exit 0 = OK · exit 1 = violación
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Variables de las que conocemos el rol de estado. Si no se pasan por --vars, se infieren:
// cualquier variable asignada a un literal más de una vez en todo el fichero.
// Sólo variables que DECIDEN un valor que llega al cliente. Las de trazabilidad
// (apeObsFuente) se asignan en ramas mutuamente excluyentes y no son objeto de este gate:
// incluirlas produce falsos positivos que erosionan la confianza en el check.
const VARS_POR_DEFECTO = ['apeNivelRealce', 'apeNivelMax'];

function esAsignacionLiteral(linea, varName) {
    // $v = <literal>;   donde literal es número, string, true/false/null, o array literal de una línea
    const re = new RegExp('^\\s*\\$' + varName + '\\s*=\\s*([0-9]+|"[^"]*"|\'[^\']*\'|true|false|null)\\s*;\\s*$');
    return re.test(linea);
}

function esAsignacionCalculada(linea, varName) {
    const re = new RegExp('^\\s*\\$' + varName + '\\s*=(?!=)');
    return re.test(linea) && !esAsignacionLiteral(linea, varName);
}

function indentacion(linea) {
    const m = linea.match(/^(\s*)/);
    return m ? m[1].length : 0;
}

function analizar(fichero, vars) {
    const src = fs.readFileSync(fichero, 'utf8');
    const lineas = src.split(/\r?\n/);
    const violaciones = [];

    for (const v of vars) {
        const literales = [];
        const calculadas = [];

        lineas.forEach((l, i) => {
            if (esAsignacionLiteral(l, v)) {
                literales.push({ n: i + 1, texto: l.trim(), ind: indentacion(l) });
            } else if (esAsignacionCalculada(l, v)) {
                calculadas.push({ n: i + 1, texto: l.trim(), ind: indentacion(l) });
            }
        });

        // Regla 1: jamás dos asignaciones literales a la misma variable de estado.
        // La segunda no puede ser intencional: o es inicialización duplicada, o pisa un cálculo.
        // Sólo cuentan las del MISMO nivel de indentación: dos asignaciones en ramas
        // distintas de un if/foreach son legítimas y no se pisan entre sí.
        const porNivel = new Map();
        for (const lit of literales) {
            if (!porNivel.has(lit.ind)) porNivel.set(lit.ind, []);
            porNivel.get(lit.ind).push(lit);
        }
        for (const [nivel, grupo] of porNivel) {
            if (grupo.length > 1) {
                violaciones.push({
                    tipo: 'DOBLE_LITERAL',
                    variable: v,
                    detalle: `recibe ${grupo.length} asignaciones literales al mismo nivel (ind=${nivel}): ` +
                        grupo.map(x => 'L' + x.n + '=' + x.texto).join(' · '),
                    lineas: grupo.map(x => x.n),
                });
            }
        }

        // Regla 2: una literal DESPUÉS de una calculada, al mismo nivel de indentación o menos,
        // la sobrescribe. Es el patrón exacto que causó el defecto.
        for (const cal of calculadas) {
            for (const lit of literales) {
                if (lit.n > cal.n && lit.ind <= cal.ind) {
                    violaciones.push({
                        tipo: 'LITERAL_PISA_CALCULO',
                        variable: v,
                        detalle: `L${lit.n} (${lit.texto}) sobrescribe el cálculo de L${cal.n} (${cal.texto})`,
                        lineas: [cal.n, lit.n],
                    });
                }
            }
        }
    }

    return { fichero, vars, violaciones };
}

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('uso: node tools/check_single_assignment.js <fichero.php> [--vars a,b,c]');
        process.exit(2);
    }
    const fichero = args[0];
    if (!fs.existsSync(fichero)) {
        console.error('[CHECK] no existe: ' + fichero);
        process.exit(2);
    }
    let vars = VARS_POR_DEFECTO;
    const iVars = args.indexOf('--vars');
    if (iVars >= 0 && args[iVars + 1]) {
        vars = args[iVars + 1].split(',').map(s => s.trim()).filter(Boolean);
    }

    const r = analizar(fichero, vars);

    console.log('[CHECK] ' + path.basename(fichero) + ' · variables de estado: ' + r.vars.join(', '));

    // Sólo cuentan las variables que aparecen en el fichero; las ausentes no son un fallo.
    const presentes = r.vars.filter(v => new RegExp('\\$' + v + '\\b').test(fs.readFileSync(fichero, 'utf8')));
    console.log('[CHECK] presentes: ' + (presentes.length ? presentes.join(', ') : 'ninguna'));

    if (r.violaciones.length === 0) {
        console.log('[CHECK] PASS — ninguna variable de estado se pisa');
        process.exit(0);
    }

    console.error('');
    console.error('[CHECK] FAIL — ' + r.violaciones.length + ' violación(es):');
    for (const vi of r.violaciones) {
        console.error('  · ' + vi.tipo + ' en $' + vi.variable);
        console.error('    ' + vi.detalle);
        console.error('    líneas: ' + vi.lineas.join(', '));
    }
    console.error('');
    console.error('  Un cálculo que otra línea borra es un valor que nunca llega al cliente.');
    console.error('  Corrige la asignación duplicada; no la silencies.');
    process.exit(1);
}

main();
