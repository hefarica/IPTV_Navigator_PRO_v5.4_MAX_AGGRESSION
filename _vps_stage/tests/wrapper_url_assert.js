#!/usr/bin/env node
'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * t35 · WRAPPER URL ASSERT — RC-2 (lado generador): `url=` en la URL del resolver
 * ═══════════════════════════════════════════════════════════════════════════
 * Verificación OFFLINE, sin navegador y sin VPS. Se prueba el código REAL:
 *
 *   [1] Extrae del wrapper el bloque `#region t35-urlparam` … `#endregion`
 *       (la derivación de `providerUrl` / `urlParam`) y lo evalúa en `vm`.
 *
 *   [2] Extrae la plantilla REAL del tag `#EXTATTRFROMURL:` del fuente y la
 *       evalúa con los identificadores que usa (resolverBase, chId, profile,
 *       listId, profileConfig, originParam, sidParam, srvParam, urlParam).
 *       Así se verifica la URL que se emite de verdad, no una copia.
 *
 * Comprueba:
 *   · la URL del resolver contiene `url=`;
 *   · decodifica EXACTAMENTE a la URL del proveedor (round-trip);
 *   · no hay doble codificación;
 *   · el resto de parámetros (ch,p,mode,list,bw,buf,th1,th2,pfseg,pfpar,tbw,
 *     origin,sid) sigue intacto y en el mismo orden;
 *   · `srv` se transporta verbatim y NO se introduce `ctx`;
 *   · sin URL de proveedor ⇒ sin `url=` (nunca un parámetro vacío);
 *   · el `ape_jwt=` del catálogo no se filtra al parámetro;
 *   · una sola URL por canal (un único `entry += url`).
 *
 * Uso:  node _vps_stage/tests/wrapper_url_assert.js
 * Sale 0 si todo pasa, 1 si algo falla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const WRAPPER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-api-wrapper-integrated.js');

// ── Harness ────────────────────────────────────────────────────────────────
let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return true; }
  failures.push(detail ? `${name} — ${detail}` : name);
  return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

const src = fs.readFileSync(WRAPPER, 'utf8');

// ── [1] Bloque de derivación (código REAL) ────────────────────────────────
const rStart = src.indexOf('// #region t35-urlparam');
const rEnd = src.indexOf('// #endregion t35-urlparam');
if (rStart < 0 || rEnd < 0) {
  console.error('FATAL: no se encontró el bloque #region t35-urlparam en el wrapper.');
  process.exit(1);
}
const region = src.slice(rStart, rEnd);

// ── [2] Plantilla REAL del tag #EXTATTRFROMURL ────────────────────────────
const tplMatch = src.match(/entry \+= `(#EXTATTRFROMURL:[\s\S]*?)`\s*;/);
if (!tplMatch) {
  console.error('FATAL: no se encontró la plantilla `entry += #EXTATTRFROMURL:…` en el wrapper.');
  process.exit(1);
}
const TPL = tplMatch[1];
const buildTag = new Function(
  'resolverBase', 'resolveScript', 'chId', 'profile', 'listId', 'profileConfig',
  'originParam', 'sidParam', 'srvParam', 'urlParam',
  'return `' + TPL + '`;',
);

// Ejecuta la derivación real con un canal dado.
function derive(channel, fallbackUrl) {
  const ctx = { channel, url: fallbackUrl === undefined ? '' : fallbackUrl };
  vm.createContext(ctx);
  vm.runInContext(region + '\n;globalThis.__T = { providerUrl: providerUrl, urlParam: urlParam };', ctx);
  return ctx.__T;
}

console.log('══ t35 · WRAPPER URL ASSERT (RC-2) ══');
console.log(`   wrapper    ${WRAPPER.split(path.sep).pop()} (${src.length} B)`);
console.log(`   bloque RC-2 ${region.length} B · plantilla EXTATTRFROMURL ${TPL.length} B`);

// Escenario base: canal Xtream normal (url con query propia + JWT del catálogo)
const PROVIDER = 'http://line.tivi-ott.net:8080/live/user/pass/1312008.m3u8';
const CH = { url: PROVIDER, stream_id: 1312008 };
const D = derive(CH, '');
const RESOLVER = buildTag(
  'https://iptv-ape.duckdns.org', '/resolve_quality_unified.php', 1312008, 'P1',
  '22.2.0-FUSION', { max_bandwidth: 50500000, buffer: 37500, throughput_t1: 17.4, throughput_t2: 21.4, bitrate_mbps: 8 },
  '&origin=line.tivi-ott.net', '&sid=1312008', '&srv=QUJD%3D%3D', D.urlParam,
);

// ═══════════════════════════════════════════════════════════════════════════
// [1] `url=` presente, único y con round-trip exacto
// ═══════════════════════════════════════════════════════════════════════════
section('[1] url= presente, único y decodificable');
ok('1.1 la plantilla real incluye ${urlParam}', TPL.includes('${urlParam}'));
ok('1.2 urlParam empieza por &url=', D.urlParam.startsWith('&url='), D.urlParam);
eq('1.3 url= aparece EXACTAMENTE 1 vez', (RESOLVER.match(/[?&]url=/g) || []).length, 1);
{
  const m = /[?&]url=([^&\n]*)/.exec(RESOLVER);
  ok('1.4 el parámetro url= tiene valor', !!m && m[1].length > 0);
  const decoded = m ? decodeURIComponent(m[1]) : '';
  eq('1.5 decodifica EXACTAMENTE a la URL del proveedor', decoded, PROVIDER);
  ok('1.6 sin doble codificación (el valor decodificado no trae %)', !/%[0-9A-Fa-f]{2}/.test(decoded), decoded);
  ok('1.7 el valor NO está doble-codificado en el texto', !/url=[^&\n]*%25(3A|2F)/.test(RESOLVER));
}

// ═══════════════════════════════════════════════════════════════════════════
// [2] El resto del contrato sigue intacto
// ═══════════════════════════════════════════════════════════════════════════
section('[2] Resto de parámetros intactos (ch,p,mode,list,bw,buf,th1,th2,pfseg,pfpar,tbw,origin,sid,srv)');
ok('2.1 tag correcto', RESOLVER.startsWith('#EXTATTRFROMURL:https://iptv-ape.duckdns.org/resolve_quality_unified.php?'));
for (const [name, pat] of [
  ['ch', /[?&]ch=1312008(&|$)/],
  ['p', /[?&]p=P1(&|$)/],
  ['mode', /[?&]mode=adaptive(&|$)/],
  ['list', /[?&]list=22\.2\.0-FUSION(&|$)/],
  ['bw', /[?&]bw=50500000(&|$)/],
  ['buf', /[?&]buf=37500(&|$)/],
  ['th1', /[?&]th1=17\.4(&|$)/],
  ['th2', /[?&]th2=21\.4(&|$)/],
  ['pfseg', /[?&]pfseg=90(&|$)/],
  ['pfpar', /[?&]pfpar=40(&|$)/],
  ['tbw', /[?&]tbw=8000(&|$)/],
  ['origin', /[?&]origin=line\.tivi-ott\.net(&|$)/],
  ['sid', /[?&]sid=1312008(&|$)/],
]) {
  ok(`2 · ${name} preservado`, pat.test(RESOLVER), RESOLVER.slice(0, 220));
}
ok('2.14 srv transportado VERBATIM (sin re-codificar)', RESOLVER.includes('&srv=QUJD%3D%3D'), 'srv');
ok('2.15 NO se introduce ctx= (no inventado)', !/[?&]ctx=/.test(RESOLVER));
ok('2.16 orden final: …${srvParam}${urlParam}', /srv=[^&\n]*&url=/.test(RESOLVER), RESOLVER.slice(-90));

// ═══════════════════════════════════════════════════════════════════════════
// [3] Casos límite
// ═══════════════════════════════════════════════════════════════════════════
section('[3] Casos límite');
{
  // (a) URL de proveedor con su PROPIA query (Xtream query_hls)
  const q = 'http://host.tv/playlist?username=u&password=p&type=m3u';
  const d = derive({ url: q, stream_id: 7 }, '');
  const out = buildTag('https://vps', '/resolve_quality_unified.php', 7, 'P3', 'L', {}, '', '&sid=7', '', d.urlParam);
  eq('3.1 la URL del resolver tiene UN solo ?', (out.match(/\?/g) || []).length, 1);
  const m = /[?&]url=([^&\n]*)/.exec(out);
  ok('3.2a la URL del resolver lleva url= con query propia', !!m, out.slice(-120));
  eq('3.2b round-trip exacto con query propia', m ? decodeURIComponent(m[1]) : '', q);
  ok('3.3 el & de la query del proveedor va codificado (%26)', d.urlParam.includes('%26'), d.urlParam);
}
{
  // (b) el JWT del catálogo NO se filtra al parámetro
  const withJwt = PROVIDER + '?ape_jwt=eyJhbGciOi.payload.sig';
  const d = derive({ url: withJwt, stream_id: 1312008 }, '');
  eq('3.4 ape_jwt se elimina del providerUrl', d.providerUrl, PROVIDER);
  ok('3.5 el valor de url= no contiene ape_jwt', !d.urlParam.includes('ape_jwt'), d.urlParam);
}
{
  // (c) sin URL de proveedor ⇒ NO se emite url= (nunca vacío)
  const d = derive({ stream_id: 9 }, '');
  eq('3.6 sin providerUrl ⇒ urlParam vacío', d.urlParam, '');
  const out = buildTag('https://vps', '/resolve_quality_unified.php', 9, 'P3', 'L', {}, '', '&sid=9', '', d.urlParam);
  ok('3.7 sin providerUrl ⇒ NO aparece url=', !/[?&]url=/.test(out), out);
}
{
  // (d) fallback: si el canal no trae url, se usa la URL construida (sin JWT)
  const d = derive({ stream_id: 11 }, 'http://fallback.tv/live/u/p/11.m3u8?ape_jwt=x.y.z');
  eq('3.8 fallback usa la URL construida y limpia el JWT', d.providerUrl, 'http://fallback.tv/live/u/p/11.m3u8');
}
{
  // (e) direct_source como segunda fuente
  const d = derive({ direct_source: 'http://ds.tv/a/b/c.ts' }, '');
  eq('3.9 direct_source aceptado', d.providerUrl, 'http://ds.tv/a/b/c.ts');
}
{
  // (f) caracteres que rompen URLs: espacios y acentos deben sobrevivir codificados
  const weird = 'http://host.tv/live/Canal Uno/Ñandú.m3u8';
  const d = derive({ url: weird }, '');
  const out = buildTag('https://vps', '/r.php', 1, 'P3', 'L', {}, '', '', '', d.urlParam);
  const m = /[?&]url=([^&\n]*)/.exec(out);
  ok('3.10 el valor url= existe', !!m);
  eq('3.10b espacios/acentos sobreviven el round-trip', m ? decodeURIComponent(m[1]) : '', weird);
  ok('3.11 no hay espacios crudos dentro del valor', !!m && !/\s/.test(m[1]), m ? m[1] : '(sin url=)');
}

// ═══════════════════════════════════════════════════════════════════════════
// [4] Estructura del catálogo intacta
// ═══════════════════════════════════════════════════════════════════════════
section('[4] Una sola URL por canal (estructura intacta)');
eq('4.1 un único `entry += url` (la URI del canal)', (src.match(/entry \+= `\$\{url\}`/g) || []).length, 1);
ok('4.2 el tag EXTATTRFROMURL sigue siendo una línea aparte', /entry \+= `#EXTATTRFROMURL:/.test(src));
ok('4.3 no se añadió una segunda línea de URL al canal', !/entry \+= `\$\{url\}`[\s\S]{0,40}entry \+= `https?:/.test(src));
ok('4.4 srvParam conserva su construcción original (btoa+encodeURIComponent)', /srvToken = btoa\(/.test(src) && /srvParam = `&srv=\$\{encodeURIComponent\(srvToken\)\}`/.test(src));
ok('4.5 la derivación no toca srv/ctx (sólo channel.url/direct_source/url)', region.includes('channel.url') && !region.includes('srvParam') && !region.includes('_ctx'));

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
  console.log('NOTA HONESTA: no se ejecutó el wrapper completo (clase de navegador).');
  console.log('              Se evalúan el bloque RC-2 real y la plantilla REAL del tag.');
  console.log('════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════');
  process.exit(1);
}
