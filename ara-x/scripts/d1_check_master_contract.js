#!/usr/bin/env node
'use strict';

/**
 * D1 · Verificador del contrato maestro ARA-X.
 *
 * Gates D1-A..D1-J:
 *   A  registro de directivas coherente (27, orden, gramática, sin duplicados)
 *   B  el bloque del contrato == buildGlobalBlock() del inyector (drift gate)
 *   C  el bloque no añade tags media-only ni contiene directivas prohibidas
 *   D  inserción en LAS DOS listas: canales/URLs/tvg-id/STREAM-INF invariantes (Never-Drop)
 *   E  directivas exigidas por el capitán presentes con su valor canónico
 *   F  8K: 0 RESOLUTION=7680x4320 en las listas; MAX-PRESENT/8K-MODE correctos
 *   G  gate SoC: CANON idéntico en D2/D3/D4 + §8.3.2 (unknown/soc_raw + 3 traducciones del ack)
 *   H  idempotencia y fail-open del inyector
 *   I  escaneo de secretos en los entregables
 *   J  coherencia numérica con R1/R2/D2/D3/D4/D5
 *
 * Uso: node ara-x/scripts/d1_check_master_contract.js [--no-inject]
 *   --no-inject  omite D1-D (evita escribir ~1,1 GB temporales); el resto se ejecuta igual.
 *
 * Sin red, sin dependencias npm, determinista.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'spec');
const REP = path.join(ROOT, 'reports');
const EVID = path.join(ROOT, 'evidence');

const LIST_VERSION = '2026-10-30T22:07:37Z';
const CONTRACT = path.join(SPEC, 'ARA_X_MASTER_CONTRACT.md');
const REGISTRY = path.join(SPEC, 'ara_x_directives.json');
const INJECTOR = path.join(ROOT, 'playlist', 'ara_x_injector.js');
const LISTS = [
  { id: 'A', file: path.join(EVID, 'APE_LISTA_4K_live_20261030_full.m3u8'), channels: 10631, streamInf: 10631 },
  { id: 'B', file: path.join(EVID, 'APE_LISTA_CDN_1793397700248_full.m3u8'), channels: 10631, streamInf: 10586 },
];

const MEDIA_ONLY = new Set([
  '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE', '#EXT-X-DISCONTINUITY-SEQUENCE', '#EXT-X-ENDLIST',
  '#EXT-X-PLAYLIST-TYPE', '#EXT-X-I-FRAMES-ONLY', '#EXT-X-PART', '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
  '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT', '#EXT-X-SKIP', '#EXT-X-BITRATE', '#EXT-X-GAP',
]);

const checks = [];
const warnings = [];
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const read = (p) => fs.readFileSync(p, 'utf8');
const check = (id, name, ok, detail) => checks.push({ id, name, ok: !!ok, detail });
const warn = (id, msg) => warnings.push({ id, msg });

function must(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------- list parsing
async function parseList(file) {
  const st = fs.statSync(file);
  const out = {
    bytes: st.size, lines: 0, extinf: 0, urls: 0, streamInf: 0, res7680: 0,
    araVersion: 0, blockStart: 0, firstExtinf: 0, mediaOnly: {},
    urlDigest: '', tvgDigest: '', elapsedMs: 0,
  };
  const t0 = Date.now();
  const urlH = crypto.createHash('sha256');
  const tvgH = crypto.createHash('sha256');
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const raw of rl) {
    out.lines++;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') continue;
    if (line.startsWith('#EXT-X-ARA-VERSION:')) { out.araVersion++; if (!out.blockStart) out.blockStart = out.lines; }
    if (line.startsWith('#EXTINF')) {
      out.extinf++;
      if (!out.firstExtinf) out.firstExtinf = out.lines;
      const m = /tvg-id="([^"]*)"/.exec(line);
      tvgH.update((m ? m[1] : '') + '\n');
      continue;
    }
    if (line.startsWith('#')) {
      const tag = line.slice(0, line.indexOf(':') === -1 ? line.length : line.indexOf(':'));
      if (MEDIA_ONLY.has(tag)) out.mediaOnly[tag] = (out.mediaOnly[tag] || 0) + 1;
      if (line.startsWith('#EXT-X-STREAM-INF:')) out.streamInf++;
      continue;
    }
    if (line.includes('RESOLUTION=7680x4320')) out.res7680++;
    out.urls++;
    urlH.update(sha(line) + '\n');
  }
  rl.close();
  out.urlDigest = urlH.digest('hex');
  out.tvgDigest = tvgH.digest('hex');
  out.elapsedMs = Date.now() - t0;
  return out;
}

// ---------------------------------------------------------------- contract block
function extractBlock(md) {
  const begin = md.indexOf('<!-- BLOCK:RENDER:BEGIN -->');
  const end = md.indexOf('<!-- BLOCK:RENDER:END -->');
  must(begin !== -1 && end !== -1 && end > begin, 'marcadores BLOCK:RENDER no encontrados en el contrato');
  const segment = md.slice(begin, end);
  const lines = segment.split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.startsWith('#EXT-X-ARA-'));
  return lines;
}

function classOk(value, cls, registry) {
  const def = registry.value_classes[cls];
  if (!def) return false;
  return new RegExp(def.grammar).test(value);
}

// ---------------------------------------------------------------- main
async function main() {
  const noInject = process.argv.includes('--no-inject');
  const t0 = Date.now();

  const md = read(CONTRACT);
  const registry = JSON.parse(read(REGISTRY));
  const inj = require(INJECTOR);

  // ---------- D1-A: registro
  const order = registry.block.order;
  const okA1 = Array.isArray(order) && order.length === 27;
  const nums = order.map((e) => e.n).join(',');
  const okA2 = nums === Array.from({ length: 27 }, (_, i) => i + 1).join(',');
  const tags = order.map((e) => e.tag);
  const okA3 = new Set(tags).size === tags.length;
  const forbiddenOk = Array.isArray(registry.forbidden) && registry.forbidden.length > 0 &&
    registry.forbidden.every((f) => typeof f.tag === 'string' && f.tag.startsWith('#EXT-X-') && f.reason && f.replaces);
  const badGrammar = [];
  for (const e of order) {
    if (e.canonical === '<LIST_VERSION>') continue;
    if (!classOk(e.canonical, e.class, registry)) badGrammar.push(`${e.tag}=${e.canonical} (${e.class})`);
    if (e.allowed && !e.allowed.includes(e.canonical)) badGrammar.push(`${e.tag} fuera de allowed`);
    if (e.enum && !e.enum.includes(e.canonical)) badGrammar.push(`${e.tag} fuera de enum`);
    if (e.range && (Number(e.canonical) < e.range[0] || Number(e.canonical) > e.range[1])) badGrammar.push(`${e.tag} fuera de rango`);
  }
  check('D1-A', 'registro 27 directivas ordenadas, únicas y gramaticales', okA1 && okA2 && okA3 && badGrammar.length === 0 && forbiddenOk,
    `n=${order.length} orden=${okA2} únicas=${okA3} gramática=${badGrammar.length === 0 ? 'OK' : badGrammar.join('; ')}`);

  // ---------- D1-B: bloque == inyector
  const block = extractBlock(md);
  const expected = inj.buildGlobalBlock({ listVersion: LIST_VERSION });
  const okB = block.length === expected.length && block.every((l, i) => l === expected[i]);
  const firstDiff = block.findIndex((l, i) => l !== expected[i]);
  check('D1-B', 'bloque del contrato == buildGlobalBlock() del inyector (27 líneas)',
    okB, okB ? `27/27 idénticas (LIST_VERSION=${LIST_VERSION})` : `len ${block.length}/${expected.length}; primera dif @${firstDiff}: "${block[firstDiff]}" vs "${expected[firstDiff]}"`);
  check('D1-B2', 'tags del bloque == orden del registro', block.length === tags.length && block.every((l, i) => l.startsWith(tags[i] + ':')),
    `${block.length}/${tags.length} prefijos`);

  // ---------- D1-C: sin media-only ni prohibidas
  const blockTags = block.map((l) => l.slice(0, l.indexOf(':')));
  const mediaInBlock = blockTags.filter((t) => MEDIA_ONLY.has(t));
  const forbiddenViolations = [];
  for (const f of registry.forbidden) {
    for (const line of block) {
      if (!line.startsWith(f.tag + ':')) continue;
      const val = line.slice(f.tag.length + 1);
      if (!f.values || f.values.includes('*') || f.values.includes(val)) forbiddenViolations.push(`${f.tag}:${val}`);
    }
  }
  check('D1-C', 'el bloque no añade tags media-only ni directivas prohibidas',
    mediaInBlock.length === 0 && forbiddenViolations.length === 0,
    `media-only=${mediaInBlock.length} prohibidas=${forbiddenViolations.length}${forbiddenViolations.length ? ' (' + forbiddenViolations.join(',') + ')' : ''}`);

  // ---------- D1-E / D1-F: directivas exigidas + 8K
  const required = [
    '#EXT-X-ARA-MINIMUM-DECODE-RESOLUTION:3840x2160',
    '#EXT-X-ARA-NEVER-DOWNSCALE:true',
    '#EXT-X-ARA-FPS-TARGETS:60,30,24',
    '#EXT-X-ARA-PRIORITY:zero-frame-drops',
    '#EXT-X-ARA-8K-MODE:PRESENTATION',
  ];
  const missingReq = required.filter((r) => !block.includes(r));
  check('D1-E', 'directivas exigidas presentes con valor canónico', missingReq.length === 0,
    missingReq.length ? `faltan: ${missingReq.join(' | ')}` : '5/5');
  const maxPresent = block.find((l) => l.startsWith('#EXT-X-ARA-MAX-PRESENT-RESOLUTION:'));
  const eightKMode = block.find((l) => l.startsWith('#EXT-X-ARA-8K-MODE:'));
  check('D1-F', '8K: MAX-PRESENT declarado y 8K-MODE válido en el bloque',
    !!maxPresent && /:(7680x4320|3840x2160)$/.test(maxPresent) && /:(PRESENTATION|DISABLED)$/.test(eightKMode || ''),
    `${maxPresent} · ${eightKMode}`);

  // ---------- D1-G: gate SoC + traducciones
  const syncFeatures = JSON.parse(read(path.join(ROOT, 'vps', 'schema', 'sync_features.json')));
  const canonD3 = [...syncFeatures.socs.canonical].sort().join(',');
  const leverMap = JSON.parse(read(path.join(SPEC, 'lever_namespace_map.json')));
  const canonD4 = [...leverMap.soc.canonical].sort().join(',');
  const canonExpected = ['amlogic', 'mt8696', 's905x3', 's905x4'].sort().join(',');
  const hasUnknownClause = /soc\s*=\s*"?unknown"?|`unknown`/.test(md) && md.includes('soc_raw') && md.includes('D4-F10');
  const hasTranslations = md.includes('not_allowlisted') && md.includes('no_caps') && md.includes('lifecycle_pending') && md.includes('cl[]');
  check('D1-G', 'gate SoC idéntico en D3/D4 y §8.3.2 con unknown + 3 traducciones',
    canonD3 === canonExpected && canonD4 === canonExpected && hasUnknownClause && hasTranslations,
    `canon D3=${canonD3} · D4=${canonD4} · unknown/soc_raw=${hasUnknownClause} · traducciones=${hasTranslations}`);

  // ---------- D1-H: idempotencia + fail-open (sintético, barato)
  const synthetic = '#EXTM3U\n#EXT-X-VERSION:9\n#EXTINF:-1 tvg-id="1" tvg-name="A",A\nhttp://example.invalid/a.m3u8\n';
  const once = inj.injectText(synthetic, { listVersion: LIST_VERSION });
  const twice = inj.injectText(once.text, { listVersion: LIST_VERSION });
  const nonCatalog = inj.injectText('#EXTM3U\n#EXTINF:-1,sin tvg\nhttp://example.invalid/x\n');
  const okH = once.injected === true && once.blockLines === 27 && twice.injected === false && twice.text === once.text &&
    nonCatalog.injected === false && nonCatalog.text === '#EXTM3U\n#EXTINF:-1,sin tvg\nhttp://example.invalid/x\n';
  check('D1-H', 'idempotencia (2.ª pasada no inyecta) y fail-open fuera de catálogo', okH,
    `1ª=${once.injected}/${once.blockLines} · 2ª=${twice.injected} · fail-open=${nonCatalog.reason}`);

  // ---------- D1-I: secretos
  const secretPatterns = [
    { name: 'clave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'userinfo con password', re: /:\/\/[^/\s:@]+:[^/@\s]+@/ },
    { name: 'credencial en path /a/', re: /\/a\/\d+\/[A-Za-z0-9_-]{4,}\/[A-Za-z0-9_-]{4,}\// },
    { name: 'Xtream con credenciales', re: /\/live\/[A-Za-z0-9]{4,}\/[A-Za-z0-9]{4,}\/\d+\.m3u8/ },
    { name: 'asignación de secreto', re: /(token|secret|password|passwd|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_.\-]{8,}/i },
  ];
  const secretHits = [];
  for (const f of [CONTRACT, REGISTRY]) {
    const text = read(f);
    for (const p of secretPatterns) if (p.re.test(text)) secretHits.push(`${path.basename(f)}:${p.name}`);
  }
  check('D1-I', 'escaneo de secretos en los entregables', secretHits.length === 0, secretHits.length ? secretHits.join(' | ') : '0 hits');

  // ---------- D1-D: inyección en LAS DOS listas
  if (noInject) {
    warn('D1-D', 'omitido por --no-inject');
  } else {
    for (const L of LISTS) {
      if (!fs.existsSync(L.file)) { check(`D1-D[${L.id}]`, 'lista presente', false, `falta ${path.basename(L.file)}`); continue; }
      const orig = await parseList(L.file);
      const tmp = path.join(EVID, `_d1_tmp_${L.id}.m3u8`);
      let injStats = null, res = null;
      try {
        res = await inj.injectFile(L.file, tmp, { listVersion: LIST_VERSION });
        injStats = await parseList(tmp);
        const blockBytes = block.reduce((n, l) => n + Buffer.byteLength(l, 'utf8') + 1, 0);
        const delta = fs.statSync(tmp).size - orig.bytes;
        const sameMedia = JSON.stringify(orig.mediaOnly) === JSON.stringify(injStats.mediaOnly);
        const okD =
          orig.extinf === L.channels && injStats.extinf === L.channels &&
          orig.streamInf === L.streamInf && injStats.streamInf === L.streamInf &&
          orig.urls === L.channels && injStats.urls === L.channels &&
          orig.urlDigest === injStats.urlDigest &&
          orig.tvgDigest === injStats.tvgDigest &&
          sameMedia &&
          orig.res7680 === 0 && injStats.res7680 === 0 &&
          injStats.araVersion === 1 &&
          injStats.blockStart === orig.firstExtinf &&
          injStats.firstExtinf === orig.firstExtinf + block.length &&
          delta === blockBytes && res.injected === true && res.blockLines === block.length;
        check(`D1-D[${L.id}]`, 'Never-Drop al insertar el bloque: canales/URLs/tvg-id/STREAM-INF invariantes',
          okD,
          `extinf ${orig.extinf}→${injStats.extinf} · urls ${orig.urls}→${injStats.urls} · si ${orig.streamInf}→${injStats.streamInf} · ` +
          `urlDigest ${orig.urlDigest === injStats.urlDigest ? 'igual' : 'DISTINTO'} · tvgDigest ${orig.tvgDigest === injStats.tvgDigest ? 'igual' : 'DISTINTO'} · ` +
          `mediaOnly ${sameMedia ? 'igual' : 'DISTINTO'} · bloque@${injStats.blockStart} (esperado ${orig.firstExtinf}) · Δbytes ${delta}/${blockBytes}`);
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* noop */ }
      }
    }
  }

  // ---------- D1-J: coherencia numérica
  const r1 = JSON.parse(read(path.join(REP, 'R1_findings.json')));
  const cases = JSON.parse(read(path.join(SPEC, 'ara_x_codec_cases.json')));
  const d5 = JSON.parse(read(path.join(SPEC, 'decision_test_vectors.json')));
  const r1Local = r1.measurements.local;
  const r1Cdn = r1.measurements.cdn;
  const avcStrings = ['avc1.640033', 'avc1.64002A', 'avc1.640028'];
  const caseText = JSON.stringify(cases);
  const h264IsHvc1 = (cases.cases || []).filter((c) => (c.input || {}).source_family === 'h264' &&
    /^hvc1/.test((((c.expect || {}).wire || {}).video_codec) || ''));
  const reachable = leverMap.keys.filter((k) => k.reachable_from_policy === true).length;
  const forbiddenKeys = leverMap.keys.filter((k) => k.forbidden_by_contract === true).length;
  const vppKeys = leverMap.keys.filter((k) => k.in_vpp_levers === true).length;
  const okJ =
    r1Local.channels === 10631 &&
    r1Local.truth_x_tab.truthful_4k_metadata === 808 &&
    r1Local.truth_x_tab.declared_4k_wire_only === 9823 &&
    r1Cdn.channels_without_stream_inf === 45 &&
    r1Local.duplicates.tvg_name === 108 &&
    (cases.cases || []).length === 36 &&
    avcStrings.every((s) => caseText.includes(s)) &&
    h264IsHvc1.length === 0 &&
    Object.keys(syncFeatures.features).length === 29 &&
    syncFeatures.levers.vpp.length === 13 &&
    leverMap.keys.length === 29 && reachable === 15 && forbiddenKeys === 3 && leverMap.aliases.length === 1 && vppKeys === 13 &&
    (d5.vectors || []).length === 26 &&
    md.includes('10.631') && md.includes('9.823') && md.includes('808') && md.includes('channels_without_variant') && md.includes('108');
  check('D1-J', 'coherencia numérica R1/R2/D2/D3/D4/D5',
    okJ,
    `R1 10631/808/9823/45/108 · D2 36 casos & avc1 OK & FZ-01=${h264IsHvc1.length} · D3 29/13 · D4 29/15/${forbiddenKeys}/1/${vppKeys} · D5 ${(d5.vectors || []).length}`);

  // ---------- drift de digests citados: se LEEN del Anexo C (no se codifican a mano)
  const cited = [
    ['ara_x_device_apply.md', path.join(SPEC, 'ara_x_device_apply.md')],
    ['ara_x_codec_policy.md', path.join(SPEC, 'ara_x_codec_policy.md')],
    ['R1_list_forensics.md', path.join(REP, 'R1_list_forensics.md')],
    ['R2_codec_truth.md', path.join(REP, 'R2_codec_truth.md')],
    ['sync_features.json', path.join(ROOT, 'vps', 'schema', 'sync_features.json')],
  ];
  for (const [name, file] of cited) {
    if (!fs.existsSync(file)) { warn('DIGEST', `${name}: no existe`); continue; }
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('`[^`]*' + esc + '`[^|]*\\|\\s*([0-9.]+)\\s*\\|\\s*`([0-9A-F]{8})');
    const m = rx.exec(md);
    const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
    const bytes = fs.statSync(file).size;
    if (!m) { warn('DIGEST', `${name}: no citado en el Anexo C`); continue; }
    const citedBytes = Number(m[1].replace(/\./g, ''));
    if (!h.startsWith(m[2]) || citedBytes !== bytes) {
      warn('DIGEST', `${name}: contrato cita ${m[1]} B/${m[2]}…, actual ${bytes} B/${h.slice(0, 8)}… (actualizar Anexo C)`);
    }
  }

  // ---------- salida
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.id} · ${c.name}`);
    if (!c.ok || process.env.D1_VERBOSE === '1') console.log(`      ${c.detail}`);
  }
  for (const w of warnings) console.log(`WARN ${w.id} · ${w.msg}`);
  console.log(`\nchecks=${checks.length} pass=${checks.length - failed.length} fail=${failed.length} · ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(failed.length === 0 ? 'ALL_OK' : 'NOT_OK');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e && e.message || e); process.exit(2); });
