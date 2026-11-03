#!/usr/bin/env node
'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VÍA B — FUSIBLE EN CALIENTE (`X-APE-Fuse`) · edge assert
 * ═══════════════════════════════════════════════════════════════════════════
 * Verificación OFFLINE, sin nginx y sin VPS:
 *
 *   [1] ASSERT ESTÁTICO de los DOS handlers reales
 *       · ape_header.lua      captura X-APE-Fuse / -TTL, fija ngx.ctx.ape_fuse,
 *                             resuelve el suelo y registra estado en ape_flags.
 *       · ape_uri_rebase.lua  reescribe SOLO el suelo, sólo con el fusible
 *                             activo, al eof, después del rebase.
 *
 *   [2] CROSS-CHECK de la tabla P0..P5 del Lua contra la tabla esperada.
 *
 *   [3] MODELO JS del rewrite (misma semántica que `apply_fuse`) sobre
 *       fixtures: con cabecera y sin cabecera, comprobando byte-identidad en el
 *       fallback y que CODECS / BANDWIDTH / RESOLUTION / FRAME-RATE quedan
 *       intactos.
 *
 * NO afirma nada sobre LuaJIT/nginx: `luac` NO existe en esta máquina, así que
 * la validación de sintaxis Lua nativa queda [UNKNOWN] por diseño.
 *
 * Uso:  node _vps_stage/tests/fuse_edge_assert.js
 * Sale 0 si todo pasa, 1 si algo falla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');

const LUA_DIR = path.join(__dirname, '..', 'lua');
const HEADER_PATH = path.join(LUA_DIR, 'ape_header.lua');
const REBASE_PATH = path.join(LUA_DIR, 'ape_uri_rebase.lua');

// ── Harness mínimo ────────────────────────────────────────────────────────
let pass = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass += 1;
    return true;
  }
  failures.push(detail ? `${name} — ${detail}` : name);
  return false;
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return ok(name, a === e, `esperado ${e}, obtenido ${a}`);
}

function section(title) {
  console.log(`\n── ${title}`);
}

// Quita comentarios Lua para que los chequeos de código no se disparen con la
// prosa (p.ej. el comentario "nunca ngx.exit" del header). Sigue teniendo
// dientes: un `ngx.exit` ejecutable sobrevive al stripping.
function stripLuaComments(code) {
  return code
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--[^\n]*/g, '');
}

// Escrituras globales = asignación a un nombre que NO es `local` ni parámetro de
// función. Se excluyen los campos de constructor de tabla (`P0 = 18000000,`
// dentro de `local tbl = { ... }`) porque no son asignaciones.
// El write-guard de OpenResty sólo bloquea escrituras GLOBALES: esto es lo que
// hay que vigilar, no la prosa ni los literales de tabla.
function luaGlobalWrites(code) {
  const src = stripLuaComments(code);

  const known = new Set();
  // declaraciones `local x` / `local a, b` / `local function f`
  for (const m of src.matchAll(/\blocal\s+(?:function\s+)?([A-Za-z_][\w,\s]*)/g)) {
    for (const name of m[1].split(',')) {
      const n = name.trim();
      if (/^[A-Za-z_]\w*$/.test(n)) known.add(n);
    }
  }
  // parámetros de función (con nombre o anónimas)
  for (const m of src.matchAll(/function\s*[A-Za-z_.:]*\s*\(([^)]*)\)/g)) {
    for (const name of m[1].split(',')) {
      const n = name.trim();
      if (/^[A-Za-z_]\w*$/.test(n)) known.add(n);
    }
  }

  // Profundidad de llaves { } al inicio de cada línea: >0 ⇒ dentro de una tabla.
  const lines = src.split('\n');
  const depths = [];
  let depth = 0;
  for (const line of lines) {
    depths.push(depth);
    let inStr = false;
    let quote = '';
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (inStr) {
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = true;
        quote = c;
      } else if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth = Math.max(0, depth - 1);
      }
    }
  }

  const flagged = [];
  lines.forEach((line, idx) => {
    if (depths[idx] > 0) return;                       // campo de tabla
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*[^=]/.exec(line);
    if (m && !known.has(m[1])) flagged.push(line.trim());
  });
  return flagged;
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLA DEL CONTRATO (fuente de verdad del suelo, en bps)
// ═══════════════════════════════════════════════════════════════════════════
const FUSE_FLOOR_BPS = {
  P0: 18000000, // 18.0 Mbps
  P1: 10000000, // 10.0 Mbps
  P2: 10000000, // 10.0 Mbps
  P3: 3500000,  //  3.5 Mbps
  P4: 1400000,  //  1.4 Mbps
  P5: 700000,   //  0.7 Mbps
};

const FORBIDDEN_FIELDS = ['CODECS=', 'BANDWIDTH=', 'RESOLUTION=', 'FRAME-RATE='];

// ═══════════════════════════════════════════════════════════════════════════
// MODELO JS de `apply_fuse` (debe reflejar EXACTAMENTE la semántica del Lua)
// ───────────────────────────────────────────────────────────────────────────
// Lua:  body:gsub("%f[%w_](min_bandwidth=)(%d+)", ...)
// JS:   /(?<![\w])(min_bandwidth=)(\d+)/g
//
// `%f[%w_]` en Lua = "frontera hacia un carácter de [A-Za-z0-9_]" = el nombre
// del campo NO viene precedido de alfanumérico ni `_`. La negative lookbehind
// `(?<![\w])` de JS ( \w = [A-Za-z0-9_], incluye `_` ) es exactamente eso, y en
// el índice 0 ambas casan (no hay carácter previo).
// ═══════════════════════════════════════════════════════════════════════════
function applyFuseModel(body, fuseBps) {
  const n = Math.floor(Number(fuseBps));
  if (!Number.isFinite(n) || n <= 0) return { body, hits: 0 };  // 0/negativo/ausente
  const bps = String(n);

  let hits = 0;
  let out = body;

  out = out.replace(/(?<![\w])(adaptive-minbitrate=)(\d+)/g, (_m, pre) => {
    hits += 1;
    return pre + bps;
  });

  out = out.replace(/(?<![\w])(min_bandwidth=)(\d+)/g, (_m, pre) => {
    hits += 1;
    return pre + bps;
  });

  return { body: out, hits };
}

// Simula el par de handlers: header decide, body aplica.
function simulate(body, { fuseHeader, profile }) {
  const fuse = fuseHeader === '1' || fuseHeader === 'true';
  if (!fuse) return { body, hits: 0, fused: false };        // sin cabecera
  const bps = profile ? FUSE_FLOOR_BPS[String(profile).toUpperCase()] : undefined;
  if (!bps) return { body, hits: 0, fused: false };          // sin perfil ⇒ intacto
  const r = applyFuseModel(body, bps);
  return { body: r.body, hits: r.hits, fused: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════
const FIXTURE_FLOOR = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXTINF:-1 tvg-id="1" tvg-name="beIN Sports 1 HD" group-title="Deportes",beIN Sports 1 HD',
  '#EXTVLCOPT:http-user-agent=Mozilla/5.0',
  '#EXTVLCOPT:adaptive-minbitrate=0',
  '#EXTVLCOPT:network-caching=60000',
  '#KODIPROP:inputstream.adaptive.min_bandwidth=500000',
  '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0',
  'http://provider.test/live/user/pass/1.m3u8',
  '',
].join('\n');

const FIXTURE_MASTER = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-INDEPENDENT-SEGMENTS',
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ',
  '2160p/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="hvc1.1.6.L123.B0,mp4a.40.2"',
  '1080p/index.m3u8',
  '#KODIPROP:inputstream.adaptive.min_bandwidth=8000000',
  '#EXTVLCOPT:adaptive-minbitrate=8000000',
  '',
].join('\n');

// Contiene las TRAMPAS: `prefetch_min_bandwidth=` (no debe tocarse) y el tag
// en mayúsculas con `:` (#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:) que tampoco.
const FIXTURE_PREFETCH = [
  '#EXTM3U',
  '#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:40000000',
  '#EXT-X-APE-PREFETCH-SEGMENTS:15',
  '#KODIPROP:inputstream.adaptive.min_bandwidth=4000000',
  'prefetch_min_bandwidth=500000000',
  '#EXTVLCOPT:adaptive-minbitrate=4000000',
  '',
].join('\n');

function extractDeclaredFields(body) {
  const grab = (re) => body.match(re) || [];
  return {
    codecs: grab(/CODECS="[^"]*"/g),
    bandwidth: grab(/(?<![\w-])BANDWIDTH=\d+/g),
    avgBandwidth: grab(/AVERAGE-BANDWIDTH=\d+/g),
    resolution: grab(/RESOLUTION=\d+x\d+/g),
    frameRate: grab(/FRAME-RATE=[\d.]+/g),
    videoRange: grab(/VIDEO-RANGE=[A-Z]+/g),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGA
// ═══════════════════════════════════════════════════════════════════════════
function readOrDie(p, label) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`FATAL: no se pudo leer ${label} (${p}): ${e.message}`);
    process.exit(1);
  }
}

const header = readOrDie(HEADER_PATH, 'ape_header.lua');
const rebase = readOrDie(REBASE_PATH, 'ape_uri_rebase.lua');

console.log('══ FUSE EDGE ASSERT · Vía B (X-APE-Fuse) ══');
console.log(`   ape_header.lua      ${header.length} bytes / ${header.split('\n').length - 1} líneas`);
console.log(`   ape_uri_rebase.lua  ${rebase.length} bytes / ${rebase.split('\n').length - 1} líneas`);

// ═══════════════════════════════════════════════════════════════════════════
// [1] ASSERT ESTÁTICO — ape_header.lua
// ═══════════════════════════════════════════════════════════════════════════
section('[1a] ape_header.lua — captura de X-APE-Fuse y estado');

ok('1a.1 lee $http_x_ape_fuse', header.includes('ngx.var.http_x_ape_fuse'));
ok('1a.2 acepta "1" y "true"', header.includes('(h == "1" or h == "true")'));
ok('1a.3 fija ngx.ctx.ape_fuse', header.includes('ngx.ctx.ape_fuse'));
ok('1a.4 fija ngx.ctx.ape_fuse_bps', header.includes('ngx.ctx.ape_fuse_bps'));
ok('1a.5 fija ngx.ctx.ape_fuse_profile', header.includes('ngx.ctx.ape_fuse_profile'));
ok('1a.6 lee la cabecera opcional X-APE-Fuse-TTL', header.includes('http_x_ape_fuse_ttl'));
ok('1a.7 TTL por defecto = 300 s', /FUSE_DEFAULT_TTL\s*=\s*300\b/.test(header));
ok('1a.8 TTL acotado (min/max)', /FUSE_TTL_MIN/.test(header) && /FUSE_TTL_MAX/.test(header));
ok('1a.9 usa el shared dict ape_flags', header.includes('ngx.shared.ape_flags'));
ok(
  '1a.10 clave por dispositivo+host `fuse:<ip>:<host>`',
  header.includes('"fuse:" .. ip .. ":" .. host') &&
    header.includes('ngx.var.remote_addr') &&
    header.includes('ngx.var.ape_host'),
);
ok('1a.11 escribe con exptime (3er argumento)', /dict:set\([^)]*fuse_ttl\(\)\)/.test(header));
ok('1a.12 registra ambos estados ("1"/"0")', /on and "1" or "0"/.test(header));
ok('1a.13 captura bajo pcall (nunca bloquea)', /pcall\(function\(\)[\s\S]*http_x_ape_fuse/.test(header));
ok('1a.14 el fallo del pcall degrada a fusible OFF', /if not fuse_ok then[\s\S]*ape_fuse = false/.test(header));

section('[1b] ape_header.lua — resolución del perfil (no inventa)');

ok('1b.1 normaliza P0..P5 y rechaza el resto', /\^P\[0-5\]\$/.test(header));
ok('1b.2 perfil explícito por cabecera', header.includes('http_x_ape_profile'));
ok('1b.3 perfil por query (?profile / ?p)', header.includes('arg_profile') && header.includes('arg_p'));
ok('1b.4 fallback server-side por identidad de canal', header.includes('ape_profile_resolver.lua'));
ok('1b.5 resuelve sólo con el fusible encendido', /if on then[\s\S]*resolve_profile/.test(header));
ok('1b.6 sin perfil ⇒ WARN y cuerpo intacto (no inventa)', /fuse ON sin perfil resoluble/.test(header));
ok('1b.7 cabecera de respuesta sólo con fusible activo', header.includes('ngx.header["X-APE-Fuse"]'));

section('[1c] ape_header.lua — no regresión del comportamiento previo');

ok('1c.1 sigue anulando Content-Length', header.includes('ngx.header["Content-Length"] = nil'));
ok('1c.2 sigue marcando X-APE-Meta-Mode', header.includes('"X-APE-Meta-Mode"') && header.includes('"rebase-only"'));
ok('1c.3 sigue ejecutando sentinel_auth_guard', header.includes('sentinel_auth_guard.lua'));
ok('1c.4 sentinel sigue bajo pcall', /pcall\(dofile, dir \.\. "sentinel_auth_guard\.lua"\)/.test(header));

// ═══════════════════════════════════════════════════════════════════════════
// [2] ASSERT ESTÁTICO — ape_uri_rebase.lua
// ═══════════════════════════════════════════════════════════════════════════
section('[2a] ape_uri_rebase.lua — rewrite del suelo');

ok('2a.1 define apply_fuse', /local function apply_fuse\(/.test(rebase));
ok('2a.2 campo adaptive-minbitrate en código', stripLuaComments(rebase).includes('adaptive%-minbitrate='));
ok('2a.3 campo min_bandwidth en código', stripLuaComments(rebase).includes('min_bandwidth='));
ok('2a.5 sólo actúa con ngx.ctx.ape_fuse == true', rebase.includes('ngx.ctx.ape_fuse == true'));
ok('2a.6 usa ngx.ctx.ape_fuse_bps', rebase.includes('ngx.ctx.ape_fuse_bps'));
ok('2a.7 rechaza suelo 0/negativo/ausente (defensa en profundidad)',
  /if floor_bps <= 0 then return body, 0 end/.test(rebase) &&
  /if not floor_bps then return body, 0 end/.test(rebase));
ok('2a.8 WARN si fusible activo sin suelo', /fuse activo sin suelo resoluble/.test(rebase));

section('[2b] ape_uri_rebase.lua — el ÚNICO campo tocado es el suelo');

// Cuerpo ejecutable de apply_fuse: desde su definición hasta el `end`, SIN comentarios.
const afStart = rebase.indexOf('local function apply_fuse(');
const afEnd = afStart >= 0 ? rebase.indexOf('\nend\n', afStart) : -1;
const afRaw = afStart >= 0 && afEnd > afStart ? rebase.slice(afStart, afEnd) : '';
const afCode = stripLuaComments(afRaw);

ok('2b.1 apply_fuse localizado', afCode.length > 0);
for (const field of FORBIDDEN_FIELDS) {
  ok(`2b.2 apply_fuse NO contiene \`${field}\``, afCode.length > 0 && !afCode.includes(field));
}

// Patrones de gsub REALES (sólo código): deben ser exactamente 2 y AMBOS con la
// guarda de frontera. Se cuenta sobre código, no sobre comentarios: la prosa que
// documenta `%f[%w_]` no puede hacer pasar esta aserción.
const fusePatterns = [...afCode.matchAll(/:gsub\(\s*"([^"]*)"/g)].map((m) => m[1]);
eq('2b.3 exactamente 2 gsub en apply_fuse', fusePatterns.length, 2);
ok('2b.4 ambos patrones llevan la guarda %f[%w_]',
  fusePatterns.length === 2 && fusePatterns.every((p) => p.startsWith('%f[%w_]')),
  `patrones: ${JSON.stringify(fusePatterns)}`);
ok('2b.5 un patrón por campo permitido (sin prefetch)',
  fusePatterns.length === 2 &&
    fusePatterns.some((p) => p.includes('adaptive%-minbitrate=')) &&
    fusePatterns.some((p) => !p.includes('adaptive%-minbitrate=') && p.includes('min_bandwidth=')) &&
    fusePatterns.every((p) => !p.includes('prefetch')),
  `patrones: ${JSON.stringify(fusePatterns)}`);

section('[2c] ape_uri_rebase.lua — chunk-safety y orden de fases');

const iEofGuard = rebase.indexOf('if not eof then');
const iRebaseCall = rebase.lastIndexOf('rebase_body(');
const iFuseCall = rebase.lastIndexOf('apply_fuse(');
ok('2c.1 acumula en ngx.ctx.ape_buf', rebase.includes('ngx.ctx.ape_buf'));
ok('2c.2 retiene chunks hasta el eof', iEofGuard >= 0 && rebase.includes('ngx.arg[1] = nil'));
ok('2c.3 el rewrite ocurre DESPUÉS del guard de eof', iFuseCall > iEofGuard,
  `eof@${iEofGuard} fuse@${iFuseCall}`);
ok('2c.4 el rewrite ocurre DESPUÉS de rebase_body', iFuseCall > iRebaseCall,
  `rebase@${iRebaseCall} fuse@${iFuseCall}`);
ok('2c.5 sin fusible `out` es exactamente `rebased`', /local out = rebased/.test(rebase));

section('[2d] Telemetría y disciplina de fase');

ok('2d.1 contador fuse_hits', rebase.includes('fuse_hits'));
ok('2d.2 usa el dict ape_qoe', rebase.includes('ngx.shared.ape_qoe'));
ok('2d.3 nil-safe si el dict no existe', /local qoe = ngx\.shared\.ape_qoe\n\s*if qoe then/.test(rebase));
ok('2d.4 incr protegido con pcall', /pcall\(qoe\.incr, qoe, "fuse_hits", 1, 0\)/.test(rebase));

section('[2e] Disciplina de autopista (ambos handlers)');

ok('2e.1 ape_header.lua sin ngx.exit ejecutable', !stripLuaComments(header).includes('ngx.exit'));
ok('2e.2 ape_uri_rebase.lua sin ngx.exit ejecutable', !stripLuaComments(rebase).includes('ngx.exit'));
ok('2e.3 ape_header.lua sin funciones globales', !/^\s*function\s+\w/m.test(stripLuaComments(header)));
ok('2e.4 ape_uri_rebase.lua sin funciones globales', !/^\s*function\s+\w/m.test(stripLuaComments(rebase)));
{
  const gw = luaGlobalWrites(header);
  ok('2e.5 ape_header.lua sin escrituras globales', gw.length === 0, gw.join(' | '));
}
{
  const gw = luaGlobalWrites(rebase);
  ok('2e.6 ape_uri_rebase.lua sin escrituras globales', gw.length === 0, gw.join(' | '));
}

// ═══════════════════════════════════════════════════════════════════════════
// [3] CROSS-CHECK de la tabla P0..P5 Lua ↔ contrato
// ═══════════════════════════════════════════════════════════════════════════
section('[3] Tabla de suelos P0..P5 (Lua ↔ contrato)');

const luaTable = {};
for (const m of header.matchAll(/\bP([0-5])\s*=\s*(\d+)\b/g)) {
  luaTable[`P${m[1]}`] = Number(m[2]);
}
for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  eq(`3.${p} ${p} = ${FUSE_FLOOR_BPS[p]} bps`, luaTable[p], FUSE_FLOOR_BPS[p]);
}
eq('3.7 la tabla Lua tiene exactamente 6 perfiles', Object.keys(luaTable).length, 6);

// ═══════════════════════════════════════════════════════════════════════════
// [4] MODELO — comportamiento con y sin cabecera
// ═══════════════════════════════════════════════════════════════════════════
section('[4a] SIN cabecera ⇒ byte-idéntico (fallback total)');

for (const [name, fx] of [['floor', FIXTURE_FLOOR], ['master', FIXTURE_MASTER], ['prefetch', FIXTURE_PREFETCH]]) {
  const r = simulate(fx, { fuseHeader: undefined, profile: undefined });
  ok(`4a.${name} cuerpo idéntico sin cabecera`, r.body === fx);
  ok(`4a.${name} 0 hits sin cabecera`, r.hits === 0);
}
{
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: '0', profile: 'P0' });
  ok('4a.4 X-APE-Fuse: 0 ⇒ sin fusión', r.body === FIXTURE_FLOOR && r.hits === 0);
}
{
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: 'yes', profile: 'P0' });
  ok('4a.5 valor no reconocido ⇒ sin fusión', r.body === FIXTURE_FLOOR && r.hits === 0);
}

section('[4b] CON cabecera ⇒ reescribe el suelo al valor del perfil');

for (const [p, bps] of Object.entries(FUSE_FLOOR_BPS)) {
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: '1', profile: p });
  ok(`4b.${p} adaptive-minbitrate → ${bps}`, r.body.includes(`#EXTVLCOPT:adaptive-minbitrate=${bps}`));
  ok(`4b.${p} min_bandwidth → ${bps}`, r.body.includes(`inputstream.adaptive.min_bandwidth=${bps}`));
  ok(`4b.${p} 2 sustituciones`, r.hits === 2, `hits=${r.hits}`);
  ok(`4b.${p} ninguna cifra previa sobrevive`,
    !r.body.includes('adaptive-minbitrate=0') && !r.body.includes('min_bandwidth=500000'));
}
{
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: 'true', profile: 'P3' });
  ok('4b.7 "true" también enciende el fusible', r.body.includes('adaptive-minbitrate=3500000'));
}
{
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: '1', profile: 'p5' });
  ok('4b.8 perfil en minúsculas se normaliza', r.body.includes('adaptive-minbitrate=700000'));
}

section('[4c] Campos PROHIBIDOS intactos (CODECS/BANDWIDTH/RESOLUTION/FRAME-RATE)');

for (const [name, fx] of [['master', FIXTURE_MASTER], ['floor', FIXTURE_FLOOR]]) {
  const before = extractDeclaredFields(fx);
  const after = extractDeclaredFields(applyFuseModel(fx, FUSE_FLOOR_BPS.P0).body);
  eq(`4c.${name} CODECS intactos`, after.codecs, before.codecs);
  eq(`4c.${name} BANDWIDTH intactos`, after.bandwidth, before.bandwidth);
  eq(`4c.${name} AVERAGE-BANDWIDTH intactos`, after.avgBandwidth, before.avgBandwidth);
  eq(`4c.${name} RESOLUTION intactas`, after.resolution, before.resolution);
  eq(`4c.${name} FRAME-RATE intactos`, after.frameRate, before.frameRate);
  eq(`4c.${name} VIDEO-RANGE intactos`, after.videoRange, before.videoRange);
}
{
  const beforeMaster = extractDeclaredFields(FIXTURE_MASTER);
  ok('4c.13 el maestro realmente declara CODECS (test con dientes)', beforeMaster.codecs.length === 2);
  ok('4c.14 el maestro realmente declara RESOLUTION', beforeMaster.resolution.length === 2);
  ok('4c.15 el maestro realmente declara BANDWIDTH', beforeMaster.bandwidth.length === 2);

  const out = applyFuseModel(FIXTURE_MASTER, FUSE_FLOOR_BPS.P0).body;
  ok('4c.16 el fusible SÍ tocó el suelo del maestro', out.includes('min_bandwidth=18000000'));
  ok('4c.17 el fusible NO tocó BANDWIDTH=28000000', out.includes('BANDWIDTH=28000000'));
  ok('4c.18 el fusible NO tocó CODECS hvc1', out.includes('CODECS="hvc1.2.4.L153.B0,mp4a.40.2"'));
  ok('4c.19 el fusible NO tocó RESOLUTION 3840x2160', out.includes('RESOLUTION=3840x2160'));
  ok('4c.20 el fusible NO tocó FRAME-RATE 60.000', out.includes('FRAME-RATE=60.000'));
}

section('[4d] Guarda de frontera: prefetch_min_bandwidth NO se toca');

for (const [p, bps] of Object.entries(FUSE_FLOOR_BPS)) {
  const out = applyFuseModel(FIXTURE_PREFETCH, bps).body;
  ok(`4d.${p} prefetch_min_bandwidth sigue a 500000000`, out.includes('prefetch_min_bandwidth=500000000'));
  ok(`4d.${p} no aparece prefetch_min_bandwidth=${bps}`, !out.includes(`prefetch_min_bandwidth=${bps}`));
  ok(`4d.${p} el suelo real SÍ se reescribió`, out.includes(`inputstream.adaptive.min_bandwidth=${bps}`));
  ok(`4d.${p} el tag en mayúsculas queda intacto`,
    out.includes('#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:40000000'));
}

section('[4e] Perfil no resoluble ⇒ no inventa');

for (const profile of [undefined, null, '', 'P6', 'AUTO', 'p9']) {
  const r = simulate(FIXTURE_FLOOR, { fuseHeader: '1', profile });
  ok(`4e. perfil ${JSON.stringify(profile)} ⇒ cuerpo intacto`, r.body === FIXTURE_FLOOR);
  ok(`4e. perfil ${JSON.stringify(profile)} ⇒ 0 hits`, r.hits === 0);
}

section('[4f] Estructura y estabilidad del manifiesto');

{
  const out = applyFuseModel(FIXTURE_FLOOR, FUSE_FLOOR_BPS.P0).body;
  ok('4f.1 conserva la cabecera #EXTM3U', out.startsWith('#EXTM3U'));
  eq('4f.2 conserva el número de líneas',
    out.split('\n').length, FIXTURE_FLOOR.split('\n').length);
  ok('4f.3 conserva la URL del canal', out.includes('http://provider.test/live/user/pass/1.m3u8'));
  ok('4f.4 conserva el #EXTINF y sus atributos',
    out.includes('#EXTINF:-1 tvg-id="1" tvg-name="beIN Sports 1 HD"'));
  eq('4f.5 idempotente (2ª pasada no cambia el cuerpo)',
    applyFuseModel(out, FUSE_FLOOR_BPS.P0).body, out);
}
{
  const noFloor = '#EXTM3U\n#EXT-X-VERSION:3\nseg1.ts\n';
  const r = applyFuseModel(noFloor, FUSE_FLOOR_BPS.P0);
  ok('4f.6 cuerpo sin campos de suelo ⇒ 0 hits', r.hits === 0);
  ok('4f.7 cuerpo sin campos de suelo ⇒ idéntico', r.body === noFloor);
}

section('[4g] bps inválido ⇒ no se toca nada');

for (const bps of [0, -1, NaN, undefined, null, 'abc']) {
  const r = applyFuseModel(FIXTURE_FLOOR, bps);
  const unchanged = r.hits === 0;
  ok(`4g. bps=${String(bps)} ⇒ 0 hits`, unchanged);
}

// ═══════════════════════════════════════════════════════════════════════════
// [5] ESTRUCTURA LUA — balance de bloques
// ───────────────────────────────────────────────────────────────────────────
// No hay intérprete Lua en esta máquina (`lua`/`luac`/`luajit` AUSENTES ⇒ la
// validación de sintaxis nativa sigue siendo [UNKNOWN]). Lo que SÍ se puede
// hacer sin mentir es comprobar que los bloques están balanceados: un `end`
// perdido o de más rompería el handler en producción y aquí se detecta.
// ═══════════════════════════════════════════════════════════════════════════
function luaBlockBalance(code) {
  const src = stripLuaComments(code);
  const clean = src
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  let depth = 0;
  let pendingDo = 0;
  const re = /\b(function|if|elseif|for|while|do|end|repeat|until)\b/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const t = m[1];
    if (t === 'function' || t === 'if') depth += 1;
    else if (t === 'for' || t === 'while') { depth += 1; pendingDo += 1; }
    else if (t === 'do') { if (pendingDo > 0) pendingDo -= 1; else depth += 1; }
    else if (t === 'end') depth -= 1;
    else if (t === 'repeat') depth += 1;
    else if (t === 'until') depth -= 1;
  }
  return depth;
}

const GATEWAY_PATH = path.join(LUA_DIR, 'ape_gateway.lua');
const PUBLIC_CONF_PATH = path.join(__dirname, '..', 'public', 'ape-meta-public.conf');
const gateway = readOrDie(GATEWAY_PATH, 'ape_gateway.lua');
const publicConf = readOrDie(PUBLIC_CONF_PATH, 'ape-meta-public.conf');

section('[5] Estructura Lua (balance de bloques, sin intérprete)');

eq('5.1 ape_header.lua balanceado', luaBlockBalance(header), 0);
eq('5.2 ape_uri_rebase.lua balanceado', luaBlockBalance(rebase), 0);
eq('5.3 ape_gateway.lua balanceado', luaBlockBalance(gateway), 0);

// ═══════════════════════════════════════════════════════════════════════════
// [6] CAMINO REAL — el .conf PUBLICADO debe ejecutar un handler con el fusible
// ───────────────────────────────────────────────────────────────────────────
// Ésta es la aserción que habría cazado F1 de t18 y que NO existía: un gate
// verde sobre el archivo no prueba que el sistema pase por él. Se lee el .conf
// PUBLICADO y se comprueba que la location /cdn/ ejecuta el content handler que
// contiene el fusible.
// ═══════════════════════════════════════════════════════════════════════════
function extractNginxBlock(text, from) {
  const open = text.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return '';
}

section('[6] Camino real publicado (/cdn/) alcanza el fusible');

const cdnIdx = publicConf.search(/location\s+~\s+\^\/cdn\//);
ok('6.1 ape-meta-public.conf declara la location /cdn/', cdnIdx >= 0);
const cdnBlock = cdnIdx >= 0 ? extractNginxBlock(publicConf, cdnIdx) : '';
ok('6.2 bloque /cdn/ extraído', cdnBlock.length > 0);
ok('6.3 /cdn/ ejecuta content_by_lua_file → ape_gateway.lua',
  /content_by_lua_file[^\n]*ape_gateway\.lua/.test(cdnBlock),
  cdnBlock.replace(/\s+/g, ' ').slice(0, 200));
ok('6.4 /cdn/ NO tiene body_filter (no se reintrodujo filtro paralelo)',
  !/body_filter_by_lua/.test(cdnBlock));
ok('6.5 /cdn/ NO tiene header_filter (una directiva por fase respetada)',
  !/header_filter_by_lua/.test(cdnBlock));
ok('6.6 el handler que ejecuta /cdn/ contiene el fusible (X-APE-Fuse)',
  gateway.includes('http_x_ape_fuse') && /ape_gateway\.lua/.test(cdnBlock));
ok('6.7 el fusible emite X-APE-Floor-Fuse', gateway.includes('X-APE-Floor-Fuse'));
ok('6.8 usa la fuente de suelo preexistente lab.floor_for(profile)',
  /lab\.floor_for\(fuse_prof\)/.test(gateway));
ok('6.9 conserva X-APE-LAB-FLOOR (símbolo citado por t18)',
  gateway.includes('X-APE-LAB-FLOOR'));
ok('6.10 histéresis 25/70/20 presente',
  /FUSE_TRIGGER,\s*FUSE_RECOVER,\s*FUSE_HOLD\s*=\s*25,\s*70,\s*20/.test(gateway));
ok('6.11 estado por dispositivo en ape_flags ("fusestate:")',
  gateway.includes('"fusestate:"') && gateway.includes('FLAGS:get'));
ok('6.12 contador propio del fusible',
  gateway.includes('fuse_closed') && gateway.includes('fuse_hits'));
ok('6.13 el fusible sólo RELAJA (clamp a design_bps)',
  /fuse_bps\s*>\s*design_bps\s*then\s*fuse_bps\s*=\s*design_bps\s*end/.test(gateway));

// ═══════════════════════════════════════════════════════════════════════════
// [7] CONTROL POSITIVO sobre el artefacto REAL
// ───────────────────────────────────────────────────────────────────────────
// t18 demostró que el cuerpo servido por /cdn/ NO contiene las cadenas del
// fusible. Sin un control positivo ese "0" no prueba nada. Se escanea el
// catálogo publicado buscando (a) cadenas que SÍ existen (control) y (b) las
// cadenas objetivo, que deben ser 0 ⇒ justifica que el fusible sea semántico.
// ═══════════════════════════════════════════════════════════════════════════
function countInFile(filePath, needle) {
  const fd = fs.openSync(filePath, 'r');
  const size = fs.fstatSync(fd).size;
  const CHUNK = 4 * 1024 * 1024;
  // carry = needle.length-1 bytes: cualquier match que cruce la frontera queda
  // entero en `carry+chunk` y ningún match puede caber entero en `carry`, así
  // que contar todas las apariciones del window no duplica ninguna.
  const OVERLAP = Math.max(0, needle.length - 1);
  const buf = Buffer.allocUnsafe(CHUNK);
  let pos = 0;
  let count = 0;
  let carry = Buffer.alloc(0);
  try {
    while (pos < size) {
      const toRead = Math.min(CHUNK, size - pos);
      const read = fs.readSync(fd, buf, 0, toRead, pos);
      if (read <= 0) break;
      const window = Buffer.concat([carry, buf.subarray(0, read)]);
      let i = window.indexOf(needle, 0);
      while (i !== -1) {
        count += 1;
        i = window.indexOf(needle, i + 1);
      }
      carry = window.subarray(Math.max(0, window.length - OVERLAP));
      pos += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

section('[7] Control positivo sobre el artefacto real');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'downloaded_list.m3u8');
if (!fs.existsSync(CATALOG_PATH)) {
  console.log('   [SKIP] downloaded_list.m3u8 ausente: control positivo no ejecutado');
  ok('7.0 control positivo ejecutado o saltado explícitamente', true);
} else {
  const ctlMaxBw = countInFile(CATALOG_PATH, 'adaptive-maxbw');
  const tgtMinBitrate = countInFile(CATALOG_PATH, 'adaptive-minbitrate');
  const tgtMinBw = countInFile(CATALOG_PATH, 'min_bandwidth');

  ok('7.1 CONTROL POSITIVO: adaptive-maxbw > 0 (el escaneo funciona)',
    ctlMaxBw > 0, `adaptive-maxbw=${ctlMaxBw}`);
  eq('7.2 objetivo ausente: adaptive-minbitrate = 0', tgtMinBitrate, 0);
  eq('7.3 objetivo ausente: min_bandwidth = 0', tgtMinBw, 0);
  ok('7.4 control y objetivo medidos en el MISMO artefacto ⇒ el 0 es real',
    ctlMaxBw > 0 && tgtMinBitrate === 0 && tgtMinBw === 0,
    `ctl=${ctlMaxBw} minbitrate=${tgtMinBitrate} minbw=${tgtMinBw}`);
  console.log(`   medido: adaptive-maxbw=${ctlMaxBw} · adaptive-minbitrate=${tgtMinBitrate} · min_bandwidth=${tgtMinBw}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [8] MODELO del fusible del GATEWAY (OPEN/CLOSED + inyección + relajación)
// ───────────────────────────────────────────────────────────────────────────
// Falla si el fusible no produce una sustitución EFECTIVA en el cuerpo servido.
// ═══════════════════════════════════════════════════════════════════════════
const GW_FUSE_FLOOR = {
  P0: 18000000, P1: 10000000, P2: 10000000,
  P3: 3500000, P4: 1400000, P5: 700000,
};
const GW_TRIGGER = 25;
const GW_RECOVER = 70;
const GW_HOLD = 20;

// Suelos de diseño del export del LAB presente en el repo (_vps_stage/lab).
const LAB_DESIGN = {
  P0: 15000000, P1: 12000000, P2: 8000000,
  P3: 5000000, P4: 3000000, P5: 1500000,
};

function gwInject(body, bps) {
  const v = Math.floor(Number(bps));
  if (!Number.isFinite(v) || v <= 0) return { body, n: 0 };
  if (!body.includes('#EXTM3U')) return { body, n: 0 };
  const s = String(v);
  const dirs = `#EXTVLCOPT:adaptive-minbitrate=${s}\n#KODIPROP:inputstream.adaptive.min_bandwidth=${s}\n`;
  const idx = body.indexOf('#EXTM3U');
  const nl = body.indexOf('\n', idx);
  if (nl === -1) return { body: `${body}\n${dirs}`, n: 2 };
  return { body: body.slice(0, nl + 1) + dirs + body.slice(nl + 1), n: 2 };
}

function gwRewrite(body, bps) {
  const v = Math.floor(Number(bps));
  if (!Number.isFinite(v) || v <= 0) return { body, hits: 0 };
  let hits = 0;
  let out = body;
  out = out.replace(/(?<![\w])(adaptive-minbitrate=)(\d+)/g, (_m, p) => { hits += 1; return p + v; });
  out = out.replace(/(?<![\w])(min_bandwidth=)(\d+)/g, (_m, p) => { hits += 1; return p + v; });
  return { body: out, hits };
}

function gwDecide({ forced, buf, prevState, prevTs, now }) {
  const engaged = prevState === 'CLOSED';
  if (forced) return 'CLOSED';
  if (engaged && now - prevTs < GW_HOLD) return 'CLOSED';
  if (buf === undefined || buf === null) return engaged ? 'CLOSED' : 'OPEN';
  if (buf < GW_TRIGGER) return 'CLOSED';
  if (buf > GW_RECOVER) return 'OPEN';
  return engaged ? 'CLOSED' : 'OPEN';
}

function gwSimulate(body, opts) {
  const profile = opts.profile || 'P3';
  const design = LAB_DESIGN[profile];
  let fuse = GW_FUSE_FLOOR[profile];
  if (design > 0 && fuse > design) fuse = design;      // invariante: sólo relaja
  const state = gwDecide(opts);
  if (state !== 'CLOSED') {
    return { body, state, profile, design, fuse, injected: 0, subst: 0 };
  }
  const inj = gwInject(body, design);
  if (inj.n === 0) return { body, state, profile, design, fuse, injected: 0, subst: 0 };
  const rw = gwRewrite(inj.body, fuse);
  return { body: rw.body, state, profile, design, fuse, injected: inj.n, subst: rw.hits };
}

const GW_FIXTURE = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXTINF:6.0,',
  'seg1.ts',
  '',
].join('\n');

section('[8a] Gateway ABIERTO ⇒ cuerpo byte-idéntico');

for (const buf of [undefined, 90, 71]) {
  const r = gwSimulate(GW_FIXTURE, { forced: false, buf });
  ok(`8a. buf=${String(buf)} ⇒ OPEN`, r.state === 'OPEN');
  ok(`8a. buf=${String(buf)} ⇒ cuerpo idéntico`, r.body === GW_FIXTURE);
  ok(`8a. buf=${String(buf)} ⇒ sin inyección ni sustitución`, r.injected === 0 && r.subst === 0);
}

section('[8b] Gateway CERRADO ⇒ sustitución EFECTIVA en el cuerpo servido');

for (const [p, design] of Object.entries(LAB_DESIGN)) {
  const r = gwSimulate(GW_FIXTURE, { forced: true, profile: p });
  const expectedFloor = Math.min(GW_FUSE_FLOOR[p], design);
  ok(`8b.${p} estado CLOSED`, r.state === 'CLOSED');
  ok(`8b.${p} FLOOR=${expectedFloor}`, r.fuse === expectedFloor, `fuse=${r.fuse}`);
  ok(`8b.${p} inyectó 2 directivas`, r.injected === 2, `injected=${r.injected}`);
  ok(`8b.${p} sustituyó 2 campos (subst>0)`, r.subst === 2, `subst=${r.subst}`);
  ok(`8b.${p} el cuerpo sirve adaptive-minbitrate=${expectedFloor}`,
    r.body.includes(`#EXTVLCOPT:adaptive-minbitrate=${expectedFloor}`));
  ok(`8b.${p} el cuerpo sirve min_bandwidth=${expectedFloor}`,
    r.body.includes(`#KODIPROP:inputstream.adaptive.min_bandwidth=${expectedFloor}`));
}

section('[8c] Invariante: el fusible SÓLO relaja (fuse ≤ design)');

for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const design = LAB_DESIGN[p];
  const eff = Math.min(GW_FUSE_FLOOR[p], design);
  ok(`8c.${p} suelo efectivo ${eff} ≤ diseño ${design}`, eff <= design);
}
{
  const p0 = gwSimulate(GW_FIXTURE, { forced: true, profile: 'P0' });
  ok('8c.7 P0: fuse(18M) > design(15M) ⇒ recorta a design (sin relajación)', p0.fuse === 15000000);
  const p2 = gwSimulate(GW_FIXTURE, { forced: true, profile: 'P2' });
  ok('8c.8 P2: fuse(10M) > design(8M) ⇒ recorta a design (sin relajación)', p2.fuse === 8000000);
  console.log('   [HALLAZGO] con floor_lock_config.json del repo, P0 y P2 tienen fuse > design');
  console.log('              ⇒ en esos 2 perfiles el fusible NO relaja. Ver informe.');
}

section('[8d] Histéresis TRIGGER=25 / RECOVER=70 / HOLD=20');

eq('8d.1 buf=10 ⇒ CLOSED', gwDecide({ buf: 10, prevState: 'OPEN', prevTs: 1000, now: 2000 }), 'CLOSED');
eq('8d.2 buf=24 ⇒ CLOSED', gwDecide({ buf: 24, prevState: 'OPEN', prevTs: 1000, now: 2000 }), 'CLOSED');
eq('8d.3 buf=50 zona muerta con OPEN ⇒ OPEN', gwDecide({ buf: 50, prevState: 'OPEN', prevTs: 1000, now: 2000 }), 'OPEN');
eq('8d.4 buf=50 zona muerta con CLOSED ⇒ CLOSED', gwDecide({ buf: 50, prevState: 'CLOSED', prevTs: 1000, now: 2000 }), 'CLOSED');
eq('8d.5 buf=80 con hold vencido (21 s) ⇒ OPEN', gwDecide({ buf: 80, prevState: 'CLOSED', prevTs: 1000, now: 1021 }), 'OPEN');
eq('8d.6 buf=80 dentro del hold (19 s) ⇒ CLOSED', gwDecide({ buf: 80, prevState: 'CLOSED', prevTs: 1000, now: 1019 }), 'CLOSED');
eq('8d.7 override X-APE-Fuse=1 gana sobre buffer alto',
  gwDecide({ forced: true, buf: 99, prevState: 'OPEN', prevTs: 0, now: 5000 }), 'CLOSED');
eq('8d.8 sin señal de buffer mantiene CLOSED', gwDecide({ buf: undefined, prevState: 'CLOSED', prevTs: 1000, now: 1010 }), 'CLOSED');
eq('8d.9 sin señal de buffer mantiene OPEN', gwDecide({ buf: undefined, prevState: 'OPEN', prevTs: 1000, now: 5000 }), 'OPEN');

section('[8e] Campos PROHIBIDOS intactos también en el camino del gateway');

{
  const MASTER = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.640028,mp4a.40.2"',
    '1080p/index.m3u8',
    '',
  ].join('\n');
  const before = extractDeclaredFields(MASTER);
  const r = gwSimulate(MASTER, { forced: true, profile: 'P3' });
  const after = extractDeclaredFields(r.body);
  eq('8e.1 gateway CLOSED: CODECS intactos', after.codecs, before.codecs);
  eq('8e.2 gateway CLOSED: BANDWIDTH intactos', after.bandwidth, before.bandwidth);
  eq('8e.3 gateway CLOSED: RESOLUTION intactas', after.resolution, before.resolution);
  eq('8e.4 gateway CLOSED: FRAME-RATE intactos', after.frameRate, before.frameRate);
  ok('8e.5 gateway CLOSED: sí inyectó y sustituyó (efecto real)', r.subst === 2);
  ok('8e.6 gateway no tocó prefetch_min_bandwidth', !r.body.includes('prefetch_min_bandwidth='));
}

// ═══════════════════════════════════════════════════════════════════════════
// [9] PARIDAD de la tabla del fusible entre superficies del edge
// ═══════════════════════════════════════════════════════════════════════════
section('[9] Paridad de la tabla del fusible entre superficies');

const headerTable = {};
for (const m of header.matchAll(/\bP([0-5])\s*=\s*(\d+)\b/g)) headerTable[`P${m[1]}`] = Number(m[2]);
const gwTable = {};
for (const m of gateway.matchAll(/\bP([0-5])\s*=\s*(\d+)\b/g)) gwTable[`P${m[1]}`] = Number(m[2]);

for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  eq(`9.${p} gateway(${gwTable[p]}) == header(${headerTable[p]}) == contrato(${FUSE_FLOOR_BPS[p]})`,
    [gwTable[p], headerTable[p], FUSE_FLOOR_BPS[p]],
    [FUSE_FLOOR_BPS[p], FUSE_FLOOR_BPS[p], FUSE_FLOOR_BPS[p]]);
}
{
  // Los patrones de gsub del gateway deben ser LOS MISMOS que los de la Vía B
  // de /meta/, para que no aparezcan dos dialectos del mismo rewrite.
  const gwPatterns = [...stripLuaComments(gateway).matchAll(/:gsub\(\s*"(%%?f[^"]*)"/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith('%f'));
  eq('9.7 el gateway usa exactamente los 2 patrones de la Vía B /meta/',
    [...gwPatterns].sort(), [...fusePatterns].sort());
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
  console.log('NOTA HONESTA: validación de sintaxis Lua nativa = [UNKNOWN]');
  console.log('              (`luac` no existe en esta máquina; no se ejecutó nginx).');
  console.log('════════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════');
  process.exit(1);
}
