#!/usr/bin/env node
'use strict';
/*
 * ape-pm9-render-null-safety.test.js — EL PANEL NO SE CAE SI EL PERFIL ACTIVO NO EXISTE.
 *
 * DEFECTO MEDIDO (consola real del operador, 2026-11-22):
 *   [LAB] Import falló: TypeError: Cannot read properties of null (reading 'color')
 *       at ProfileManagerV9.render (profile-manager-v9.js:912:91)
 *   Causa: el id activo persistido apuntaba a un perfil que la config ya no tenía
 *   (import viejo dejó 6 canónicos y el activo era un `.5`). `getProfile()` devolvió null
 *   y `activeProfile.color` tumbó el render COMPLETO: el usuario vio "Import falló" con
 *   el import ya aplicado.
 *
 * QUÉ FIJA: `_pm9ResolveActive(config, id)` cae al primer perfil disponible y NUNCA
 * lanza; si no hay ninguno devuelve null para que render() pinte un estado vacío.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'ape-v9', 'profile-manager-v9.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const m = src.match(/function _pm9ResolveActive\(config, activeProfileId\) \{[\s\S]*?\n    \}/);
check(!!m, 'la función real _pm9ResolveActive existe en profile-manager-v9.js');
if (!m) { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }
const resolve = new Function('return ' + m[0])();

/* también se verifica que render() la use y ya no desreferencie getProfile directo */
check(/const _pm9Res = _pm9ResolveActive\(this\.config, this\.activeProfileId\)/.test(src), 'render() usa el resolutor');
check(!/const activeProfile = this\.config\.getProfile\(this\.activeProfileId\);/.test(src), 'render() ya NO hace la desreferencia que crasheaba');
check(/if \(!activeProfile\) \{/.test(src), 'render() tiene salida legible cuando no hay perfiles');

const P = (id) => ({ id: id, color: '#10b981', settings: { resolution: '1920x1080' } });
const twelve = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].map(P);
const six = twelve.slice(0, 6);

const cfg = (hierarchy, getter) => ({
    getDegradationHierarchy: function () { return hierarchy; },
    getAllProfiles: function () { return hierarchy.reduce((a, p) => { a[p.id] = p; return a; }, {}); },
    getProfile: getter
});

/* 1 · caso sano: el id activo existe (12 perfiles) */
const r1 = resolve(cfg(twelve, (id) => twelve.find(p => p.id === id) || null), 'P4.5');
check(r1.active && r1.active.id === 'P4.5', 'con 12 perfiles y P4.5 activo → devuelve P4.5', r1.active && r1.active.id);
check(r1.profiles.length === 12, 'la lista de perfiles se conserva completa (12)', r1.profiles.length);

/* 2 · DEFECTO REAL: 6 perfiles, activo P4.5 (inexistente) → cae a P0, no lanza */
let r2 = null, e2 = null;
try { r2 = resolve(cfg(six, (id) => six.find(p => p.id === id) || null), 'P4.5'); } catch (e) { e2 = e.message; }
check(!e2, 'caso real (6 perfiles + activo .5) NO lanza', e2);
check(r2 && r2.active && r2.active.id === 'P0', 'caso real → cae al primer perfil disponible (P0)', r2 && r2.active && r2.active.id);
check(r2 && r2.profiles.length === 6, 'no inventa perfiles: siguen siendo 6', r2 && r2.profiles.length);

/* 3 · cero perfiles → null, sin lanzar */
let r3 = null, e3 = null;
try { r3 = resolve(cfg([], () => null), 'P0'); } catch (e) { e3 = e.message; }
check(!e3 && r3 && r3.active === null, 'config vacía → active=null sin lanzar', e3 || (r3 && r3.active));

/* 4 · config sin getDegradationHierarchy (usa getAllProfiles) */
const onlyAll = { getAllProfiles: () => ({ P0: P('P0'), P1: P('P1') }), getProfile: (id) => (id === 'P1' ? P('P1') : null) };
const r4 = resolve(onlyAll, 'P1');
check(r4.profiles.length === 2 && r4.active.id === 'P1', 'sin getDegradationHierarchy usa getAllProfiles', r4.profiles.length + '/' + (r4.active && r4.active.id));

/* 5 · getProfile lanza → no propaga, cae al primero */
let r5 = null, e5 = null;
try { r5 = resolve({ getDegradationHierarchy: () => twelve, getProfile: () => { throw new Error('boom'); } }, 'P2'); } catch (e) { e5 = e.message; }
check(!e5 && r5 && r5.active.id === 'P0', 'getProfile que lanza → cae al primero', e5 || (r5 && r5.active && r5.active.id));

/* 6 · config nula / basura → sin excepción */
let r6 = null, e6 = null;
try { r6 = resolve(null, 'P0'); resolve(undefined, undefined); resolve({}, 'P9'); } catch (e) { e6 = e.message; }
check(!e6 && r6 && r6.active === null && Array.isArray(r6.profiles) && r6.profiles.length === 0, 'config null/undefined/{} → seguro', e6 || JSON.stringify(r6));

/* 7 · activeProfileId null no rompe y sigue resolviendo por la lista */
const r7 = resolve(cfg(twelve, () => null), null);
check(r7.active && r7.active.id === 'P0', 'id activo null → primer perfil', r7.active && r7.active.id);

console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"defecto":"render-null-color"}');
process.exit(fail === 0 ? 0 : 1);
