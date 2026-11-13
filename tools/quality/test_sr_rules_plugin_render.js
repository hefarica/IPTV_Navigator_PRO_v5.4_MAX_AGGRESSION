#!/usr/bin/env node
'use strict';

/**
 * test_sr_rules_plugin_render.js — Verifica lo que el plugin DSH RENDERIZA.
 *
 * Por que existe: la captura visual del panel no es alcanzable en este entorno
 * (el GUI del Harness responde 401 y el unico CDP disponible sirve otro sitio).
 * "No pude verlo" no es lo mismo que "no lo verifique": se puede ejecutar la
 * factory del modulo Client con un React simulado y comprobar que produce el
 * arbol que debe producir.
 *
 * Lo que esto PRUEBA:
 *   - el modulo se carga y expone la factory con el id correcto
 *   - `inject` pide 'slots' y `apply` registra LAS DOS cosas
 *   - el icono respeta las props { size, active } que entrega el sidebar
 *   - la pagina incluye las 7 reglas con su veredicto
 *
 * Lo que esto NO prueba: como se ve. La revision visual sigue pendiente y se
 * declara como tal.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = path.join(ROOT, 'dsh-plugins', 'iptv-sr-rules', 'client.js');
const CONTRATO = path.join(ROOT, 'contracts', 'super_resolution_rules.json');

let pass = 0;
let total = 0;
function ok(nombre, cond, detalle) {
  total++;
  if (cond) { pass++; console.log('PASS ' + nombre + (detalle ? ' · ' + detalle : '')); }
  else { console.log('FAIL ' + nombre + (detalle ? ' · ' + detalle : '')); }
}

// --- React simulado: solo lo que el modulo usa -----------------------------
const llamadas = [];
function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}
const React = {
  createElement,
  Fragment: 'Fragment',
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useReducer: (fn, init) => [init, () => {}],
};

// --- Cargador simulado ----------------------------------------------------
let moduloCargado = null;
global.window = {
  __ModuleLoader__: {
    load(def) { moduloCargado = def; },
  },
  addEventListener() {},
  removeEventListener() {},
};

const requerir = (nombre) => {
  if (nombre === 'react') return React;
  throw new Error('require inesperado: ' + nombre);
};

// --- Carga -----------------------------------------------------------------
const fuente = fs.readFileSync(CLIENT, 'utf8');
try {
  // El modulo es un script de navegador; se evalua con el window simulado.
  new Function('window', 'require', fuente)(global.window, requerir);
} catch (e) {
  console.log('FAIL no se pudo cargar client.js · ' + e.message);
  total++;
  console.log('');
  console.log(`TOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
  process.exitCode = 1;
  return;
}

ok('el modulo se registra en el cargador', !!moduloCargado);
ok('el id del modulo es el del package', moduloCargado && moduloCargado.id === '@local/iptv-sr-rules',
  moduloCargado && moduloCargado.id);

// --- Factory ---------------------------------------------------------------
const api = moduloCargado.factory(requerir);
ok('la factory devuelve inject y apply', !!api && Array.isArray(api.inject) && typeof api.apply === 'function');
ok("inject pide 'slots'", api.inject.includes('slots'), api.inject.join(','));
ok('apply no hace nada al construirse', llamadas.length === 0);

// --- apply: las DOS registraciones ----------------------------------------
const registros = [];
const ctx = {
  slots: {
    inject(owner, cb) { registros.push({ owner, cb }); },
    register(def, comp) { return { def, comp }; },
  },
};
api.apply(ctx);

ok('apply registra en DOS slots', registros.length === 2, registros.map((r) => r.owner).join(', '));
const owners = registros.map((r) => r.owner);
ok("registra en 'sidebar.panellist' (la entrada lateral)", owners.includes('sidebar.panellist'));
ok("registra en 'main' (el panel que abre)", owners.includes('main'));

// El callback de inject devuelve la registracion; se ejecuta para verla.
const defs = registros.map((r) => {
  const d = r.cb();
  return { owner: r.owner, def: d && d.def, comp: d && d.comp };
});
const sidebar = defs.find((d) => d.owner === 'sidebar.panellist');
const panel = defs.find((d) => d.owner === 'main');

ok('la entrada lateral usa id iptv-sr-rules', sidebar && sidebar.def.id === 'iptv-sr-rules', sidebar && sidebar.def.id);
ok('el panel usa la MISMA key que el id', panel && panel.def.key === 'iptv-sr-rules', panel && panel.def.key);
ok('el id del sidebar direcciona el panel main',
  sidebar && panel && sidebar.def.id === panel.def.key,
  'mismo valor en los dos = el sidebar abre este panel');

// --- Icono: props del sidebar ---------------------------------------------
ok('la entrada lateral es un componente', typeof sidebar.comp === 'function');
const ico20 = sidebar.comp({ size: 20, active: false });
const ico32 = sidebar.comp({ size: 32, active: true });
ok('el icono es un svg', ico20 && ico20.type === 'svg', ico20 && ico20.type);
ok('el icono respeta size=20', ico20.props.width === 20 && ico20.props.height === 20,
  `w=${ico20.props.width} h=${ico20.props.height}`);
ok('el icono respeta size=32', ico32.props.width === 32 && ico32.props.height === 32);
ok('active cambia la opacidad', ico20.props.style.opacity !== ico32.props.style.opacity,
  `${ico20.props.style.opacity} vs ${ico32.props.style.opacity}`);
ok('el icono no renderiza un <button> propio',
  JSON.stringify(ico20).indexOf('"button"') === -1,
  'el sidebar duenio el boton');

// --- Pagina: las 7 reglas --------------------------------------------------
ok('el panel es un componente', typeof panel.comp === 'function');
const arbol = panel.comp({});
const serializado = JSON.stringify(arbol);

const contrato = JSON.parse(fs.readFileSync(CONTRATO, 'utf8'));
const ids = (contrato.reglas || []).map((r) => r.id);
ok('la pagina incluye las 7 reglas', ids.every((id) => serializado.includes(id)),
  `${ids.filter((id) => serializado.includes(id)).length}/7`);

// Los veredictos del contrato deben aparecer en la pagina.
const veredictos = [...new Set((contrato.reglas || []).map((r) => r.veredicto).filter(Boolean))];
ok('el contrato declara veredicto en cada regla', veredictos.length > 0,
  veredictos.length ? veredictos.join(',') : 'el contrato NO tiene campo veredicto');
ok('la pagina muestra cada veredicto del contrato',
  veredictos.length > 0 && veredictos.every((v) => serializado.includes(v)), veredictos.join(','));

// --- Deriva contrato <-> plugin -------------------------------------------
// El plugin es la VISTA y el contrato el CANDADO. Si muestran veredictos
// distintos para la misma regla, el lector ve una cosa y el gate aplica otra.
// Esta comprobacion existe porque esa deriva ya ocurrio: el plugin usaba
// R1..R7 y el contrato SR-R1..SR-R7, y los veredictos vivian solo en el plugin.
const fuentePlugin = fs.readFileSync(CLIENT, 'utf8');
const delPlugin = {};
for (const m of fuentePlugin.matchAll(/id:\s*'(SR-R\d)'[\s\S]{0,400}?verdict:\s*'([A-Z_]+)'/g)) {
  delPlugin[m[1]] = m[2];
}
const deriva = (contrato.reglas || []).filter((r) => r.veredicto && delPlugin[r.id] !== r.veredicto);
ok('contrato y plugin declaran el MISMO veredicto por regla',
  Object.keys(delPlugin).length === 7 && deriva.length === 0,
  deriva.length
    ? deriva.map((r) => `${r.id}: contrato=${r.veredicto} plugin=${delPlugin[r.id]}`).join(' | ')
    : `7 reglas, ${Object.keys(delPlugin).length} leidas del plugin`);

ok('la pagina no promete que el plugin aplica las reglas',
  serializado.includes('MUESTRA') || serializado.includes('candado'),
  'declara que la vista no es la que aplica');

console.log('');
console.log(`TOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
if (pass !== total) process.exitCode = 1;
