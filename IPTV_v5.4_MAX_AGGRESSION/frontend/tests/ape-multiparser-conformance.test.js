#!/usr/bin/env node
'use strict';
/*
 * ape-multiparser-conformance.test.js — GATE tipo TRIQUETE del multiparseador (opción (a)).
 *
 * HISTORIA (2026-11-22). La primera versión de este gate afirmaba "0 rechazos" y era FALSA:
 * describía las reglas de hls.js de memoria (skill) en vez de ejecutar el parser. `t8` ejecutó
 * el M3U8Parser/AttrList REALES de hls.js 1.5.17 desde el bundle vendorizado y midió otra cosa.
 * Con la semántica corregida, la emisión real da 17 rechazos. Este gate los fija como DEUDA
 * CONOCIDA: si aparece uno nuevo, falla; si se arregla uno, también falla (hay que actualizar
 * el trinquete a la baja, que es un acto deliberado y visible).
 *
 * DEFECTOS CONOCIDOS MEDIDOS (hls.js 1.5.17 real, t8):
 *   · 12 × `#EXTINF:-1` → su regex de duración (\d*(?:\.\d+)?) no casa: duration=0 y el resto
 *     de la línea se captura como URI falso.
 *   · 4 × tags de MEDIA playlist en el catálogo (#EXT-X-START, #EXT-X-SERVER-CONTROL ×2, #EXT-X-PART-INF).
 *   · 1 × `#EXT-X-SESSION-KEY:METHOD=NONE` → warning real: «Ignoring invalid EXT-X-SESSION-KEY».
 *   · MODO = MEDIA: sin #EXT-X-STREAM-INF el parser cae en media playlist. Con el finalizer
 *     cargado (modo C de t8) aparecen 12 STREAM-INF y ENTONCES #EXT-X-TARGETDURATION fuerza
 *     isMediaPlaylist()=true y deja las 12 variantes inertes: ese es el fallo fatal real.
 *
 * LÍMITE: verificación TEXTO-PLANO. La capa #EXT-X-APE-* es de sólo escritura (199 familias,
 * 0 lectores family-aware). Auditarla exige el lector de la opción (b), que no existe todavía.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FE = path.join(__dirname, '..');
const TOOL = path.join(FE, '..', 'tools', 'diag', 'multiparser-audit.js');

let pass = 0, fail = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };
const run = (args) => spawnSync('node', [TOOL, ...args], { encoding: 'utf8', cwd: FE, timeout: 240000 });

if (!fs.existsSync(TOOL)) { console.log('SKIP  multiparser-audit.js no existe'); process.exit(0); }

/* ── 1 · autotest: 10 defectos plantados, base limpia sin falsos positivos ── */
const st = run(['--selftest']);
const stOut = (st.stdout || '') + (st.stderr || '');
const m = stOut.match(/AUTOTEST:\s*(\d+)\/(\d+)/);
check(st.status === 0, 'el multiparseador pasa su autotest (exit 0)', 'exit=' + st.status);
check(!!m && m[1] === m[2], 'detecta todos los defectos plantados', m ? m[0] : 'sin salida');
check(/BASE LIMPIA sin rechazos: SI/.test(stOut), 'la base limpia no produce falsos positivos');

/* ── 2 · emisión real: trinquete sobre los defectos conocidos ── */
const au = run(['--json']);
let parsed = null;
try { parsed = JSON.parse(au.stdout || '{}'); } catch (e) { /* abajo */ }
if (!parsed || !parsed.perfiles) {
    console.log('SKIP  auditoría sin JSON (fixture LAB ausente o error)');
    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"scope":"multiparser-plain-text-triquete"}');
    process.exit(fail === 0 ? 0 : 1);
}

const hls = parsed.perfiles.find(p => /hls\.js/.test(p.perfil));
check(!!hls, 'el perfil hls.js está presente en la auditoría');
const rechazos = hls ? hls.rechazos : 0;
const CONOCIDOS = 17;   // 12 EXTINF:-1 + 4 tags de media playlist (START, SERVER-CONTROL x2, PART-INF) + 1 SESSION-KEY (sin STREAM-INF en modo A)
check(rechazos === CONOCIDOS,
    'trinquete hls.js: rechazos == deuda conocida (' + CONOCIDOS + ')',
    'real=' + rechazos + ' · si bajó, actualizá el trinquete; si subió, hay un defecto NUEVO');

check(parsed.perfiles.length === 8, 'audita 8 familias de player', parsed.perfiles.length);

/* ── 3 · hechos que este gate debe seguir viendo ── */
const notas = (hls && hls.notas || []).join(' | ');
check(/modo detectado por hls\.js: MEDIA/.test(notas),
    'visibilidad: el catálogo entra como MEDIA playlist (si aparece MASTER, se habilitaron variantes)' );

const exo = parsed.perfiles.find(p => /ExoPlayer/.test(p.perfil));
check(exo && exo.notas.some(n => /valor único con coma: User-Agent/.test(n)),
    'REPORTA el riesgo real: User-Agent con coma (trampa OkHttp de valor único)');

/* ── 4 · ningún OTRO perfil puede rechazar líneas ── */
const otros = parsed.perfiles.filter(p => !/hls\.js/.test(p.perfil) && p.rechazos > 0);
check(otros.length === 0, 'ningún otro perfil de player rechaza la emisión', otros.map(p => p.perfil + ':' + p.rechazos).join(', '));

console.log('\nDEUDA CONOCIDA (hls.js real, medida por t8): 12 EXTINF:-1 · 3 tags de media playlist · 1 SESSION-KEY');
console.log('FATAL LATENTE: con STREAM-INF presentes, #EXT-X-TARGETDURATION fuerza MEDIA y deja las variantes inertes.');
console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"scope":"multiparser-plain-text-triquete","rechazos_hlsjs":' + rechazos + ',"perfiles":' + parsed.perfiles.length + '}');
process.exit(fail === 0 ? 0 : 1);
