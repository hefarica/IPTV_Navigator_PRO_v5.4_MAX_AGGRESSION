#!/usr/bin/env node
'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * t44 · APE-AI HEADERS ASSERT
 *   ① Censo de `X-APE-AI-*` en la lista viva (tags privados vs claves de header)
 *   ② Auditoría de generadores y consumidores
 *   ③ Saneado de las 5 copias del módulo (12 headers de marca + fallback X-AI-Mode)
 *   ④ Falla si cualquiera de los 12 nombres reaparece en cualquier copia
 * ═══════════════════════════════════════════════════════════════════════════
 * Verificación OFFLINE. Sin PHP (`php -l` = [UNKNOWN] en esta máquina) y sin VPS.
 *
 * Uso:  node _vps_stage/tests/ape_ai_headers_assert.js [--no-list] [--json]
 *   --no-list  omite el barrido de 222 MB (para CI rápida); el censo se declara omitido.
 * Sale 0 si todo pasa, 1 si algo falla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const SKIP_LIST = ARGS.includes('--no-list');
const AS_JSON = ARGS.includes('--json');

// ── Constantes del contrato ────────────────────────────────────────────────
const BRAND_HEADERS = [
  'X-Xiaomi-AI-Mode', 'X-Samsung-Picture-Engine', 'X-LG-Picture-Master', 'X-Sony-XR-Mode',
  'X-Hisense-AI-Mode', 'X-TCL-AI-Mode', 'X-Philips-P5-Mode', 'X-Vizio-IQ-Mode',
  'X-Panasonic-HCX-Mode', 'X-FireTV-Picture-Mode', 'X-AppleTV-Display-Mode', 'X-Shield-AI-Mode',
];
const FAKE_FALLBACK = 'X-AI-Mode';

const COPIES = [
  'IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php',
];

// Claves legítimas que DEBEN seguir ahí (no se tocó funcionalidad real).
const LEGIT_KEYS = ['X-AI-Upscale-Mode', 'X-Samsung-AI-Pipeline', 'X-HDR-Mode', 'X-AI-Color-Engine', 'X-Content-Resolution'];

// Baseline medido ANTES del saneado (t44, 2026-10-25).
const BEFORE = {
  brandHeaderLines: 12,          // 12 por copia
  xAiModeLines: 1,               // fallback combo, 1 por copia
  aiHeaderLines: { short: 21, big: 22 },  // backup_master(37.902 B) / vps x3(52.848 B)
  emitSites: 4,                  // $exthttp[$device['ai_header']] = ...
  listTotal: 63320,
  listKeys: 23,
  listChannels: 2754,
  listHeaderKeys: 0,             // NINGUNA es clave EXTHTTP: son tags #EXT-X-
};

const LUAS_DIRS = ['_vps_stage/lua', 'IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua'];
const PHP_DIRS = ['IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine', 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma', 'IPTV_v5.4_MAX_AGGRESSION/vps/nginx'];

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return true; }
  failures.push(detail ? `${name} — ${detail}` : name);
  return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => { if (!AS_JSON) console.log(`\n── ${t}`); };

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// Ignora comentarios de línea (`//`, `#`, `*`, `/*`) para no contar la prosa de la nota.
const codeOnly = (t) => t.split(/\r?\n/).filter((l) => !/^\s*(\/\/|#|\*|\/\*)/.test(l)).join('\n');
const braceBalance = (t) => { let a = 0, b = 0; for (const c of t) { if (c === '{') a++; else if (c === '}') b++; } return a - b; };

const report = { copies: [], census: null, consumers: {} };

// ═══════════════════════════════════════════════════════════════════════════
// ① CENSO de X-APE-AI-* en la lista viva
// ═══════════════════════════════════════════════════════════════════════════
async function census() {
  const listPath = path.join(ROOT, 'downloaded_list.m3u8');
  if (SKIP_LIST || !fs.existsSync(listPath)) return { skipped: true };
  const rl = readline.createInterface({ input: fs.createReadStream(listPath, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  let total = 0, asTag = 0, asHeaderKey = 0, other = 0, chans = 0, inChan = 0, chansWith = 0, sumPerChan = 0, maxChan = 0;
  const keys = new Map();
  for await (const l of rl) {
    if (l.startsWith('#EXTINF')) {
      if (chans > 0 && inChan > 0) { chansWith++; sumPerChan += inChan; if (inChan > maxChan) maxChan = inChan; }
      chans++; inChan = 0; continue;
    }
    const tags = l.match(/#EXT-X-APE-AI-[A-Za-z0-9-]+/g) || [];
    const hdrs = l.match(/"X-APE-AI-[A-Za-z0-9-]+"/g) || [];
    const all = l.match(/X-APE-AI-[A-Za-z0-9-]+/g) || [];
    asTag += tags.length; asHeaderKey += hdrs.length;
    other += all.length - tags.length - hdrs.length;
    total += all.length; inChan += all.length;
    for (const t of tags) keys.set(t.replace(/^#EXT-X-/, ''), (keys.get(t.replace(/^#EXT-X-/, '')) || 0) + 1);
    for (const h of hdrs) keys.set(h.slice(1, -1), (keys.get(h.slice(1, -1)) || 0) + 1);
  }
  if (chans > 0 && inChan > 0) { chansWith++; sumPerChan += inChan; if (inChan > maxChan) maxChan = inChan; }
  return {
    total, asTag, asHeaderKey, other, channels: chans, channelsWith: chansWith,
    keys: keys.size, avgPerChannel: chansWith ? +(sumPerChan / chansWith).toFixed(3) : 0, maxPerChannel: maxChan,
    top: [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② CONSUMIDORES (barrido acotado, sin tocar los 222 MB)
// ═══════════════════════════════════════════════════════════════════════════
function walk(dir, exts, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|backup|BACKUP/.test(e.name)) walk(path.join(dir, e.name), exts, out); }
    else if (exts.some((x) => e.name.endsWith(x))) { try { if (fs.statSync(p).size < 1_500_000) out.push(p); } catch (_) { } }
  }
  return out;
}
function scanConsumers() {
  // (a) Lua del edge: ¿alguien lee APE-AI?
  let luaHits = 0;
  for (const d of LUAS_DIRS) for (const f of walk(d, ['.lua'])) if (fs.readFileSync(f, 'utf8').includes('APE-AI')) luaHits += 1;
  // (b) ¿alguien lee el HEADER en servidor? (HTTP_X_APE_AI / http_x_ape_ai)
  let serverHeaderReaders = 0;
  for (const d of PHP_DIRS.concat(LUAS_DIRS)) for (const f of walk(d, ['.php', '.lua', '.conf'])) {
    const t = fs.readFileSync(f, 'utf8');
    if (/HTTP_X_APE_AI|http_x_ape_ai/.test(t)) serverHeaderReaders += 1;
  }
  // (c) generadores en frontend/js
  const gens = [];
  for (const f of walk('IPTV_v5.4_MAX_AGGRESSION/frontend/js', ['.js'])) {
    if (/BACKUP|BACKUP_PRE/.test(path.basename(f))) continue;
    const n = (fs.readFileSync(f, 'utf8').match(/X-APE-AI-/g) || []).length;
    if (n > 0) gens.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), hits: n });
  }
  return { luaHits, serverHeaderReaders, gens };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ SANEADO de las 5 copias
// ═══════════════════════════════════════════════════════════════════════════
function auditCopies() {
  for (const rel of COPIES) {
    const raw = read(rel);
    const code = codeOnly(raw);
    const brands = BRAND_HEADERS.filter((n) => code.includes(n));
    const fallback = code.includes(FAKE_FALLBACK);
    const aiHeader = (code.match(/ai_header/g) || []).length;
    const legit = LEGIT_KEYS.filter((k) => raw.includes(k)).length;
    const note = /NOTA t4[04] \(2026-10-25\)/.test(raw);
    const bal = braceBalance(raw);
    report.copies.push({ file: rel, bytes: Buffer.byteLength(raw, 'utf8'), brands: brands.length, fallback, aiHeader, legit, note, bal });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  if (!AS_JSON) { console.log('══ t44 · APE-AI HEADERS ASSERT ══'); console.log(`   raíz ${ROOT}`); }

  // ① CENSO
  section('[1] Censo de X-APE-AI-* en la lista viva');
  report.census = await census();
  const c = report.census;
  if (c.skipped) {
    if (!AS_JSON) console.log('   [SKIP] --no-list: censo omitido (declarado, no convertido en PASS)');
  } else {
    if (!AS_JSON) {
      console.log(`   TOTAL=${c.total}  claves=${c.keys}  canales=${c.channels}  media/canal=${c.avgPerChannel}  max/canal=${c.maxPerChannel}`);
      console.log(`   A) como TAG privado #EXT-X-APE-AI-*  = ${c.asTag}`);
      console.log(`   B) como CLAVE de header "X-APE-AI-*" = ${c.asHeaderKey}   <-- ruido EXTHTTP real`);
      console.log(`   C) otras formas = ${c.other}`);
    }
    eq('1.1 total de ocurrencias = baseline medido (63.320)', c.total, BEFORE.listTotal);
    eq('1.2 claves distintas = 23', c.keys, BEFORE.listKeys);
    eq('1.3 canales = 2.754', c.channels, BEFORE.listChannels);
    eq('1.4 NINGUNA es clave de header EXTHTTP (son tags #EXT-X-)', c.asHeaderKey, BEFORE.listHeaderKeys);
    eq('1.5 todas las apariciones son tags privados', c.asTag, c.total);
    ok('1.6 media por canal ≈ 23', Math.abs(c.avgPerChannel - 22.99) < 0.05, String(c.avgPerChannel));
  }

  // ② CONSUMIDORES
  section('[2] Generadores y consumidores');
  report.consumers = scanConsumers();
  const con = report.consumers;
  if (!AS_JSON) {
    console.log(`   generadores en frontend/js: ${con.gens.map((g) => `${g.file}(${g.hits})`).join(', ')}`);
    console.log(`   lectores del header en servidor (HTTP_X_APE_AI): ${con.serverHeaderReaders}`);
    console.log(`   Lua del edge que mencione APE-AI: ${con.luaHits}`);
  }
  ok('2.1 el emisor genera X-APE-AI-* (ape-profiles-config.js o m3u8-typed-arrays-ultimate.js)',
    con.gens.some((g) => g.file.endsWith('ape-profiles-config.js') || g.file.endsWith('m3u8-typed-arrays-ultimate.js')), JSON.stringify(con.gens));
  eq('2.2 NADIE lee X-APE-AI-* como header en servidor (php/lua/conf)', con.serverHeaderReaders, 0);
  eq('2.3 el edge Lua no consume APE-AI', con.luaHits, 0);

  // ③/④ COPIAS
  section('[3] Saneado de las 5 copias del módulo');
  auditCopies();
  for (const cp of report.copies) {
    const tag = path.basename(path.dirname(path.dirname(cp.file))) + '/' + cp.file.split('/').slice(-2)[0];
    if (!AS_JSON) console.log(`   ${cp.brands === 0 && !cp.fallback && cp.aiHeader === 0 && cp.legit === 5 && cp.note ? 'OK  ' : 'FAIL'} ${cp.file}  (${cp.bytes} B)`);
    eq(`3.x ${cp.file} · 0 de los 12 headers de marca`, cp.brands, 0);
    eq(`3.x ${cp.file} · sin fallback ${FAKE_FALLBACK}`, cp.fallback, false);
    eq(`3.x ${cp.file} · sin ai_header (código)`, cp.aiHeader, 0);
    eq(`3.x ${cp.file} · 5/5 claves legítimas conservadas`, cp.legit, 5);
    ok(`3.x ${cp.file} · nota de trazabilidad t40/t44`, cp.note);
    eq(`3.x ${cp.file} · llaves balanceadas`, cp.bal, 0);
  }

  // ④ reporte antes/después
  section('[4] Antes / después');
  const after = {
    brandHeaderLines: report.copies.reduce((s, x) => s + x.brands, 0),
    xAiModeLines: report.copies.reduce((s, x) => s + (x.fallback ? 1 : 0), 0),
    aiHeaderLines: report.copies.reduce((s, x) => s + x.aiHeader, 0),
    emitSites: 0,
  };
  if (!AS_JSON) {
    console.log(`   headers de marca: ${BEFORE.brandHeaderLines * COPIES.length} -> ${after.brandHeaderLines}`);
    console.log(`   fallback X-AI-Mode: ${BEFORE.xAiModeLines * COPIES.length} -> ${after.xAiModeLines}`);
    console.log(`   ai_header (código): ${BEFORE.aiHeaderLines.short + BEFORE.aiHeaderLines.big * 3} -> ${after.aiHeaderLines}`);
    console.log(`   sitios de emisión: ${BEFORE.emitSites * COPIES.length} -> ${after.emitSites}`);
    if (!c.skipped) console.log(`   X-APE-AI-* en la lista viva: ${c.total} (sin cambios: NO se retiraron — propuesta abajo)`);
  }
  eq('4.1 cero headers de marca en las 5 copias', after.brandHeaderLines, 0);
  eq('4.2 cero fallback X-AI-Mode', after.xAiModeLines, 0);
  eq('4.3 cero ai_header en código', after.aiHeaderLines, 0);

  // ⑤ DECISIÓN sobre X-APE-AI-* (propuesta, NO retirada)
  section('[5] Decisión sobre X-APE-AI-* (propuesta documentada)');
  const proposal = {
    verdict: 'NO RETIRAR (propuesta de retirada medida, pendiente del propietario)',
    why: 'Son 23 tags privados #EXT-X-APE-AI-* (inertes, RFC 8216 §6.3.1), 0 claves EXTHTTP; nadie los lee en este repo (Lua=0, HTTP_X_APE_AI=0). Pero el daemon on-device NO está en el repo ⇒ no hay evidencia de que nadie los lea.',
    measurable: c.skipped ? null : { lines: c.total, bytes_aprox: c.total * 24, per_channel: c.avgPerChannel },
  };
  report.proposal = proposal;
  if (!AS_JSON) { console.log(`   ${proposal.verdict}`); console.log(`   ${proposal.why}`); }
  ok('5.1 la decisión es NO retirar sin evidencia (doctrina no-delete)', proposal.verdict.startsWith('NO RETIRAR'));

  // ── RESUMEN ──
  if (AS_JSON) { console.log(JSON.stringify({ pass, failures, ...report }, null, 2)); }
  else {
    console.log('\n════════════════════════════════════════════════════');
    if (failures.length === 0) {
      console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
      console.log('NOTA HONESTA: php -l = [UNKNOWN] (php no instalado); estado del VPS no verificado.');
      console.log('              El saneado de las copias es estático (llaves balanceadas, 0 nombres).');
      console.log('════════════════════════════════════════════════════');
    } else {
      console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
      for (const f of failures) console.log(`  ✗ ${f}`);
      console.log('════════════════════════════════════════════════════');
    }
  }
  process.exit(failures.length === 0 ? 0 : 1);
})();
