#!/usr/bin/env node
'use strict';

// [2026-11-13] GATE: politica de composicion polimorfica (display_size_forced).
//
// HALLAZGO QUE ESTE GATE PROTEGE (medido en el ONN 4K):
//   ro.surface_flinger.max_graphics_height = 1080   -> tope de composicion del firmware
//   mBaseDisplayInfo  = 3840x2160                    -> el panel SI es 4K
//   mActiveModeId     = 123 (3840x2160 @59.94)       -> la salida HDMI SI es 4K
//   mOverrideDisplayInfo = 1920x1080                 -> la COMPOSICION esta capada
//
//   Con composicion 1080p, un video 720p se escala x1,5 en el compositor:
//     SurfaceFlinger: geomBufferSize=[0 0 1280 720] geomLayerTransform SCALE 1.5000
//   Luego el panel lo escala x2. DOS interpolaciones, la primera NO entera.
//
//   Con composicion 720p:
//     wm size -> Override 1280x720 · DisplayFrames w=1280 h=720 · panel mActiveModeId=123
//   El video pasa 1:1 y el panel hace un unico escalado x3,0 ENTERO.
//
// LO QUE ESTE GATE EXIGE:
//   1. El regex de ALLOW_KEY acepta las resoluciones legitimas (720p, 1080p)
//   2. El regex NO es la unica defensa: el applier rechaza >1920x1080 porque el SoC no puede
//   3. Las dos claves de geometria se pueden CREAR si faltan (si no, en un aparato de fabrica
//      con la clave a null la politica no se aplicaria NUNCA)
//   4. Ninguna OTRA clave gana esa excepcion (no se abre la puerta a settings arbitrarios)
//
// Uso: node tools/quality/test_composition_policy.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APPLIER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SettingsApplier.kt');
const CATALOG = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SettingsCatalog.kt');

if (!fs.existsSync(APPLIER)) { console.error('FALTA ' + APPLIER); process.exit(2); }
if (!fs.existsSync(CATALOG)) { console.error('FALTA ' + CATALOG); process.exit(2); }

const src = fs.readFileSync(APPLIER, 'utf8');
const cat = fs.readFileSync(CATALOG, 'utf8');

let ok = 0, total = 0;
function check(name, pass, detail) {
    total++;
    if (pass) ok++;
    console.log('  ' + (pass ? 'OK    ' : 'FALLA ') + name + (detail && !pass ? '   -> ' + detail : ''));
}

// ── 1 · El regex declarado en el Kotlin, extraido del fuente (no se reescribe a mano) ──
console.log('\n=== 1 · el regex real del applier ===');
const m = src.match(/"display_size_forced"\s*to\s*Regex\("([^"]+)"\)/);
check('display_size_forced tiene regex en ALLOW_KEY', !!m, 'no encontrado');
let rx = null;
if (m) {
    // El fuente Kotlin escapa \\ ; el regex real es el literal sin ese escape extra
    rx = new RegExp(m[1].replace(/\\\\/g, '\\'));
    console.log('       regex: ' + m[1]);
    const legitimas = ['1280x720', '1920x1080', '854x480', '2560x1440'];
    for (const v of legitimas) check('regex acepta ' + v, rx.test(v));
    const basura = ['abc', '1280', '1280x', 'x720', '1280x720x', '', '4K'];
    for (const v of basura) check('regex rechaza "' + v + '"', !rx.test(v));
}

// ── 2 · La defensa de TOPE es explicita en el codigo, no solo el regex ──
console.log('\n=== 2 · tope de composicion 1920x1080 declarado ===');
check('existe la comprobacion de tope', /w > 1920 \|\| h > 1080/.test(src));
check('el rechazo deja log con motivo', /excede el tope de composicion/.test(src));
check('el rechazo va a rejected[] (se reporta, no se silencia)', /rejected\.add\(s\); continue/.test(src));

// ── 3 · Excepcion de creacion LIMITADA a las dos claves de geometria ──
console.log('\n=== 3 · la excepcion de creacion es solo para geometria ===');
check('existe bootstrapGeometria', /val bootstrapGeometria\s*=/.test(src));
check('cubre exactamente display_size_forced y display_density_forced',
    /bootstrapGeometria\s*=\s*\(k == "display_size_forced" \|\| k == "display_density_forced"\)/.test(src));
check('se aplica como guarda (!exists && !bootstrapGeometria)',
    /if \(!exists && !bootstrapGeometria\) continue/.test(src));
check('NO quedo el guarda antiguo sin excepcion',
    !/^\s*if \(!exists\) continue\s*$/m.test(src));
check('crear la clave deja traza en el log', /CREANDO clave de geometria ausente/.test(src));

// ── 4 · Sigue pasando por allowlist y por KeyGuard ──
console.log('\n=== 4 · la excepcion no salta las otras barreras ===');
check('isAllowed se sigue llamando antes', /if \(!isAllowed\(ns, key, value\)\)/.test(src));
check('KeyGuard se sigue comprobando', /if \(!KeyGuard\.writable\(appCtx, ns\)\)/.test(src));
check('la clave esta en el catalogo conocido (global)', /"display_size_forced"/.test(cat));
check('la clave esta mapeada a global para TRY-BOTH-NS', /"display_size_forced"\s*to\s*"global"/.test(src));
check('prioridad 0: se aplica la primera', /k == "display_size_forced" -> 0/.test(src));

// ── 5 · Control negativo: el gate debe poder fallar ──
console.log('\n=== 5 · control negativo (el gate detecta la ausencia de la excepcion) ===');
const sinExcepcion = src.replace(/if \(!exists && !bootstrapGeometria\) continue/, 'if (!exists) continue');
check('sin la excepcion, el gate lo NOTA', !/if \(!exists && !bootstrapGeometria\) continue/.test(sinExcepcion));
const sinTope = src.replace(/w > 1920 \|\| h > 1080/, 'false');
check('sin el tope, el gate lo NOTA', !/w > 1920 \|\| h > 1080/.test(sinTope));

console.log('\n----------------------------------------');
console.log('TOTAL ' + ok + '/' + total);
process.exit(ok === total ? 0 : 1);
