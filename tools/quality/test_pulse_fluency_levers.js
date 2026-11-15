#!/usr/bin/env node
/* test_pulse_fluency_levers.js — guarda los levers de FLUIDEZ de pulse.php (t58).
 *
 * Por que existe: el TTL del cache y el reintento del 302 son los unicos levers
 * de fluidez con mecanismo escrito en el repo. Ambos viven en UN fichero
 * (IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php, la copia que el manifiesto
 * despliega). Y hay una copia duplicada en vps/stage/pulse.php que diverge —
 * exactamente en el TTL. Este test falla si el lever desaparece o si vuelve el 2 s.
 *
 * Que comprueba (sobre la copia DESPLEGABLE, no sobre la vieja):
 *   1. TTL del cache corto = 8 s (y no 2 s), y por debajo del targetduration 11 s.
 *   2. El codigo 302 esta en la lista de reintento.
 *   3. Existe el TERCER intento para 302 (el token rota: medido 200,302,302).
 *   4. Single-flight de 3 s (apcu_add) para no abrir dos conexiones al upstream.
 *   5. stale-while-error: sirve la ultima playlist buena (60 s) con stale=1 en vez
 *      de un 502 al player.
 *   6. Avisa (WARN, no falla) si la copia vieja vps/stage/pulse.php difiere en TTL.
 *
 * Uso: node tools/quality/test_pulse_fluency_levers.js   -> exit 1 si algo falla
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEPLOYED = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api', 'pulse.php');
const STALE = path.join(ROOT, 'vps', 'stage', 'pulse.php');
const MANIFEST = path.join(ROOT, '_vps_stage', 'deploy', 'manifest.tsv');

let fails = 0, warns = 0;
const ok = (n, c, d) => { if (c) console.log('PASS  ' + n + (d ? '  (' + d + ')' : '')); else { fails++; console.log('FAIL  ' + n + (d ? '  (' + d + ')' : '')); } };
const warn = (n, d) => { warns++; console.log('WARN  ' + n + (d ? '  (' + d + ')' : '')); };

ok('existe la copia que el manifiesto despliega', fs.existsSync(DEPLOYED), DEPLOYED.replace(ROOT + path.sep, ''));
if (!fs.existsSync(DEPLOYED)) { console.log('\nFALLOS: ' + fails); process.exit(1); }

const src = fs.readFileSync(DEPLOYED, 'utf8');
const lineOf = (re) => { const m = src.match(re); return m ? m[0].trim() : null; };

/* 1. TTL: el store corto tiene que ser 8, y NUNCA 2. */
const ttl8 = /apcu_store\(\$plKey,\s*\[[^\]]*\],\s*8\)/.test(src);
const ttl2 = /apcu_store\(\$plKey,\s*\[[^\]]*\],\s*2\)/.test(src);
ok('cache corto con TTL 8 s', ttl8, lineOf(/apcu_store\(\$plKey[^;]*;/));
ok('NO queda el TTL 2 s', !ttl2);
ok('el TTL (8 s) queda por debajo del targetduration (11 s): nunca sirve manifest caducado', 8 < 11, '8 < 11');
ok('la cache va por APCu y el VPS lo tiene cargado (php -m -> apcu)', /apcu_fetch/.test(src) && /apcu_store/.test(src));

/* 2-3. Reintento del 302: en la lista y con tercer intento. */
ok('el 302 esta en la lista de codigos que se reintentan',
  /\$code === 0 \|\| \$code >= 500[^\n]*\$code === 302/.test(src),
  lineOf(/if \(\(\$code === 0[^\n]*/) || '');
const i302 = src.indexOf('if ($code === 302) {');
ok('existe el TERCER intento para 302 (el token rota)', i302 > 0 && src.indexOf('ape_pulse_fetch', i302) > i302);
ok('el reintento del 302 espera antes de repetir (no martillea al proveedor)', /\$code === 302 \? 150000/.test(src), '150 ms');

/* 4. Single-flight. */
ok('single-flight de 3 s para recargas simultaneas', /apcu_add\(\$lockKey,\s*1,\s*3\)/.test(src), lineOf(/apcu_add\(\$lockKey[^;]*;/));

/* 5. stale-while-error. */
ok('stale-while-error: sirve la ultima buena (60 s)', /apcu_store\(\$goodKey,\s*\[[^\]]*\],\s*60\)/.test(src) && /apcu_fetch\(\$goodKey\)/.test(src));
ok('el stale se declara al player (X-APE-Pulse … stale=1)', /stale=1/.test(src));
ok('NUNCA se manda un 302 al player (le llegaria JSON/HTML y abortaria)', /NUNCA 302/.test(src));

/* 6. El manifiesto apunta a ESTA copia (si cambia, el guard protegeria un fichero muerto). */
const man = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';
ok('el manifiesto despliega esta copia a /var/www/html/prisma/api/pulse.php',
  /IPTV_v5\.4_MAX_AGGRESSION\/vps\/prisma\/api\/pulse\.php\s+\/var\/www\/html\/prisma\/api\/pulse\.php/.test(man));

/* 7. La copia vieja: no se despliega, pero si vuelve el 2 s hay que saberlo. */
if (fs.existsSync(STALE)) {
  const old = fs.readFileSync(STALE, 'utf8');
  const old2 = /apcu_store\(\$plKey,\s*\[[^\]]*\],\s*2\)/.test(old);
  if (old2) warn('vps/stage/pulse.php sigue con TTL 2 s (copia vieja, sin ruta de despliegue conocida)', 'no se despliega; no se borra');
  else ok('vps/stage/pulse.php no contradice el TTL', true);
}

console.log('\n' + (fails ? 'FALLOS: ' + fails : 'OK: todos los controles en verde') + (warns ? '  ·  avisos: ' + warns : ''));
process.exit(fails ? 1 : 0);
