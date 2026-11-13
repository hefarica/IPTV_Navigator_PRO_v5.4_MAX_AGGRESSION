#!/usr/bin/env node
'use strict';

/**
 * test_sr_rules_para_generacion.js — Prueba que las reglas sirven EN CALIENTE,
 * no solo como auditoria posterior.
 *
 * El objetivo pide reglas "PARA LA GENERACION". Un gate que solo sabe mirar un
 * fichero ya escrito llega tarde: cuando corre, la lista con la mentira ya se
 * publico. Estas dos funciones existen para que el generador pueda consultar
 * antes de emitir y, si quiere, emitir BIEN en vez de no emitir.
 *
 *   validarDeclaracion(texto)   -> { ok, esMenu, declaraSr, violaciones }
 *   completarDeclaracion(texto) -> { texto, anadido, ok, restantes }
 *
 * Exit 0 = todo pasa. Exit 1 = algo falla.
 */

const path = require('path');
const { validarDeclaracion, completarDeclaracion } = require(path.join(__dirname, 'check_sr_rules.js'));

let pass = 0;
let total = 0;
function ok(nombre, cond, detalle) {
  total++;
  if (cond) { pass++; console.log('PASS ' + nombre + (detalle ? ' · ' + detalle : '')); }
  else { console.log('FAIL ' + nombre + (detalle ? ' · ' + detalle : '')); }
}

// --- 1. Una declaracion conforme no se toca --------------------------------
const buena = '#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,DEGRADATION=blur:1.5,STATE=DECLARED,CLASS=ARCHIVE';
const vBuena = validarDeclaracion(buena);
ok('declaracion conforme -> ok', vBuena.ok === true);
ok('declaracion conforme -> se reconoce como declaracion', vBuena.declaraSr === true);
const cBuena = completarDeclaracion(buena);
ok('declaracion conforme -> no se modifica', cBuena.texto === buena);
ok('declaracion conforme -> no anade nada', cBuena.anadido.length === 0);

// --- 2. La declaracion REAL que el generador emite hoy ---------------------
// Medida sobre la lista de produccion: 24.777 lineas con este patron.
const real = '#EXT-X-APE-AI-SR-ENABLED:true';
const vReal = validarDeclaracion(real);
ok('la que emite el generador -> NO es conforme', vReal.ok === false);
ok('la que emite el generador -> la caza R1', vReal.violaciones.some((v) => v.id === 'SR-R1'));
ok('la que emite el generador -> la caza R7', vReal.violaciones.some((v) => v.id === 'SR-R7'));

const cReal = completarDeclaracion(real);
ok('se puede COMPLETAR en vez de prohibir', cReal.ok === true,
  cReal.ok ? cReal.texto : JSON.stringify(cReal.restantes));
ok('la completada declara el estado honesto', /STATE=DECLARED/.test(cReal.texto));
ok('la completada declara el caso de uso', /CLASS=ARCHIVE/.test(cReal.texto));
ok('la completada conserva el valor original', /ENABLED:true/.test(cReal.texto),
  'no se pierde lo que el generador queria decir');
ok('la completada anota que se anadio', cReal.anadido.length === 2,
  cReal.anadido.join(','));

// --- 3. Una etiqueta cruzada se corrige -----------------------------------
const cruzada = '#EXT-X-APE-AI-SR:MODEL=esrgan,STATE=DECLARED,CLASS=ARCHIVE,ROLE=SOURCE';
const vCruz = validarDeclaracion(cruzada);
ok('SOURCE cruzado -> lo caza R3', vCruz.violaciones.some((v) => v.id === 'SR-R3'));
const cCruz = completarDeclaracion(cruzada);
ok('SOURCE cruzado -> se corrige a ENHANCEMENT', /ROLE=ENHANCEMENT/.test(cCruz.texto), cCruz.texto);
ok('SOURCE cruzado -> queda conforme', cCruz.ok === true);

// --- 4. Lo que NO se completa solo ----------------------------------------
// Quitar una metrica falsa es una decision editorial, no un sufijo.
const metrica = '#EXT-X-APE-VMAF-TARGET:95.0';
const vMet = validarDeclaracion(metrica);
ok('metrica sin referencia -> la caza R2', vMet.violaciones.some((v) => v.id === 'SR-R2'));
const cMet = completarDeclaracion(metrica);
ok('metrica sin referencia -> NO se completa sola', cMet.ok === false,
  'una referencia inventada seria peor que la ausencia');
ok('metrica sin referencia -> dice que queda', Array.isArray(cMet.restantes) && cMet.restantes.length > 0,
  (cMet.restantes || []).map((r) => r.id).join(','));

// --- 5. Un menu no es una declaracion -------------------------------------
const menu = 'X-APE-AI-SR-MODEL: REALESRGAN_X4PLUS,ESRGAN_X2,LANCZOS4,BICUBIC';
const vMenu = validarDeclaracion(menu);
ok('menu de alternativas -> se reconoce', vMenu.esMenu === true);
ok('menu de alternativas -> no declara nada aplicado', vMenu.declaraSr === false);
ok('menu de alternativas -> conforme por no ser declaracion', vMenu.ok === true);

// --- 6. Texto vacio y ruido ------------------------------------------------
ok('cadena vacia -> conforme', validarDeclaracion('').ok === true);
ok('texto sin relacion -> conforme', validarDeclaracion('#EXTINF:-1,UN CANAL').ok === true);

// --- 7. Idempotencia: completar dos veces no cambia nada -------------------
const unaVez = completarDeclaracion(real).texto;
const dosVeces = completarDeclaracion(unaVez);
ok('completar es idempotente', dosVeces.texto === unaVez,
  'una segunda pasada no anade nada');

console.log('');
console.log(`TOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
if (pass !== total) process.exitCode = 1;
