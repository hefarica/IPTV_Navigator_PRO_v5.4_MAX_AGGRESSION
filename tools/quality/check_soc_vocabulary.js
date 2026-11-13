#!/usr/bin/env node
/**
 * check_soc_vocabulary.js — el vocabulario de SoC debe ser IDENTICO en todos los runtimes.
 *
 * POR QUE EXISTE
 *   El mandato lo dice: "sin duplicacion independiente de parametros". Pero el vocabulario
 *   de SoC estaba copiado a mano en 12 sitios de 4 runtimes (PHP, JS, Lua, Kotlin). El
 *   2026-11-13 se anadio 's905y4' a UNO solo (ara-sync.php) y el gate real de produccion
 *   (ape_mesh.php:675, el parametro por defecto de ape_soc_allowlisted) se quedo con la
 *   lista vieja. Resultado: el arreglo no habria servido de nada en produccion, y nadie
 *   se habria enterado porque no hay ningun error, solo un `allowed=false`.
 *
 * QUE HACE
 *   Extrae la lista de SoC de cada copia conocida, normaliza (minusculas, ordenada) y
 *   exige que TODAS sean iguales al canonico. Si una diverge, falla y dice cual.
 *
 * LIMITE HONESTO
 *   No verifica semantica (que el gate se use bien), solo que el VOCABULARIO coincida.
 *   Es un gate de consistencia, no de correccion.
 *
 * Uso: node tools/quality/check_soc_vocabulary.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');

/**
 * Cada fuente: como extraer la lista de SoC de ese fichero.
 * `re` debe capturar el contenido del array/tabla en el grupo 1.
 *
 * `kind` distingue DOS listas distintas que NO deben ser iguales:
 *   allow  -> SoC aceptados por el gate de politica (lista completa)
 *   no8k   -> SoC a los que se les PROHIBE declarar wire 8K (subconjunto por diseno:
 *             'amlogic' es un nombre de familia demasiado amplio para bloquear 8K)
 *
 * `extraTokens` declara tokens que esa fuente admite legitimamente y no estan en el canonico
 * (p.ej. el Lua acepta 'unknown' para el token de no-mapeado).
 */
const FUENTES = [
  {
    id: 'php:ara-sync:ara_sync_socs',
    kind: 'allow',
    file: 'ara-x/vps/php/ara-sync.php',
    re: /function\s+ara_sync_socs\(\)[\s\S]{0,1200}?return\s*\[([^\]]*)\]/,
  },
  {
    id: 'php:ara-sync:ara_sync_no_wire_8k',
    kind: 'no8k',
    file: 'ara-x/vps/php/ara-sync.php',
    re: /function\s+ara_sync_no_wire_8k\(\)[\s\S]{0,1200}?return\s*\[([^\]]*)\]/,
  },
  {
    id: 'php:ape_mesh:ape_soc_allowlisted_default',
    kind: 'allow',
    file: 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php',
    re: /function\s+ape_soc_allowlisted\([^)]*array\s*\$allow\s*=\s*array\(([^)]*)\)/,
  },
  {
    id: 'php:ape_mesh:ape_vpp_block_allow',
    kind: 'allow',
    file: 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php',
    re: /isset\(\$opts\['soc_allow'\]\)[^;]*?:\s*array\(([^)]*)\)/,
  },
  {
    id: 'kt:SyncProtocol:CANON_SOCS',
    kind: 'allow',
    file: 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SyncProtocol.kt',
    re: /val\s+CANON_SOCS\s*=\s*listOf\(([^)]*)\)/,
  },
  {
    id: 'js:ara_sync_client:KNOWN_4K_SOCS',
    kind: 'allow',
    file: 'ara-x/vps/client/ara_sync_client.js',
    re: /KNOWN_4K_SOCS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/,
  },
  {
    id: 'js:policy_engine:CANON',
    kind: 'allow',
    file: 'ara-x/policy/policy_engine.js',
    re: /const\s+CANON\s*=\s*\[([^\]]*)\]/,
  },
  {
    id: 'js:decision_core:soc_allowlist',
    kind: 'allow',
    file: 'ara-x/controller/ara_x_decision_core.js',
    re: /soc_allowlist:\s*\[([^\]]*)\]/,
  },
  {
    id: 'lua:ara_x_sync:M.SOCS',
    kind: 'allow',
    extraTokens: ['unknown'],
    file: 'ara-x/vps/lua/ara_x_sync.lua',
    re: /M\.SOCS\s*=\s*\{([^}]*)\}/,
  },
  {
    id: 'lua:ara_x_sync:M.NO_WIRE_8K',
    kind: 'no8k',
    file: 'ara-x/vps/lua/ara_x_sync.lua',
    re: /M\.NO_WIRE_8K\s*=\s*\{([^}]*)\}/,
  },
];

/** Extrae los tokens de SoC de un fragmento (sirve para [] PHP/JS, listOf KT, tabla Lua). */
function tokens(fragmento) {
  // claves = true  (tabla Lua)  ->  solo las claves
  if (/=\s*true/.test(fragmento)) {
    const out = [];
    const re = /([A-Za-z0-9_]+)\s*=\s*true/g;
    let m;
    while ((m = re.exec(fragmento)) !== null) out.push(m[1].toLowerCase());
    return out;
  }
  // comillas simples o dobles
  const out = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(fragmento)) !== null) out.push(m[1].toLowerCase());
  return out;
}

const canonico = (arr) => [...new Set(arr)].sort().join(',');

let pass = 0, fail = 0;
const fallos = [];
const extraidas = [];

for (const f of FUENTES) {
  const p = path.join(RAIZ, f.file);
  let src;
  try { src = fs.readFileSync(p, 'utf8'); }
  catch (e) { fail++; fallos.push(f.id + ' :: no se pudo leer ' + f.file); continue; }

  const m = f.re.exec(src);
  if (!m) { fail++; fallos.push(f.id + ' :: el patron no caso (cambio de formato?)'); continue; }

  const t = tokens(m[1]);
  if (t.length === 0) { fail++; fallos.push(f.id + ' :: no se extrajo ningun SoC'); continue; }

  extraidas.push({ id: f.id, kind: f.kind, extraTokens: f.extraTokens || [], socs: t, canon: canonico(t) });
  pass++;
}

// Referencia: la lista 'allow' de ara_sync_socs, que es la canonica documentada.
const refFuente = extraidas.find(e => e.kind === 'allow');
if (!refFuente) {
  console.log('0/1 PASS');
  console.log('FALLOS:\n  - no hay ninguna fuente kind=allow');
  process.exit(1);
}
const refCanon = refFuente.canon;
const refSet = new Set(refCanon.split(','));

console.log('canonico allow (de ' + refFuente.id + '):');
console.log('  ' + refCanon.split(',').join(', '));
console.log('');

let divergentes = 0;
for (const e of extraidas) {
  const suyos = new Set(e.canon.split(','));
  if (e.kind === 'allow') {
    // Debe ser EXACTAMENTE el canonico, salvo los extraTokens declarados.
    const faltan = [...refSet].filter(x => !suyos.has(x));
    const sobran = [...suyos].filter(x => !refSet.has(x) && !e.extraTokens.includes(x));
    const ok = faltan.length === 0 && sobran.length === 0;
    if (!ok) divergentes++;
    console.log((ok ? '  OK       ' : '  DIVERGE  ') + e.id + '  [allow]');
    if (faltan.length) console.log('            faltan: ' + faltan.join(', '));
    if (sobran.length) console.log('            sobran (no declarados): ' + sobran.join(', '));
    if (e.extraTokens.length) console.log('            extra declarado: ' + e.extraTokens.join(', '));
  } else {
    // no8k es SUBCONJUNTO por diseno: cada uno debe estar en el canonico,
    // y deben cubrirse los SoC que solo son 4K (no deben declarar wire 8K).
    const fuera = [...suyos].filter(x => !refSet.has(x));
    const ok = fuera.length === 0 && suyos.size > 0;
    if (!ok) divergentes++;
    console.log((ok ? '  OK       ' : '  DIVERGE  ') + e.id + '  [no8k, subconjunto]');
    if (fuera.length) console.log('            fuera del canonico: ' + fuera.join(', '));
  }
}

console.log('');
if (divergentes > 0) {
  fail++;
  fallos.push(divergentes + ' fuente(s) divergen del canonico');
}

const total = pass + fail;
console.log(pass + '/' + total + ' PASS');
if (fail > 0) {
  console.log('FALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
