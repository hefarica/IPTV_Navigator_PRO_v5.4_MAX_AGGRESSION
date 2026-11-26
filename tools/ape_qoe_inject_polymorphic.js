#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Inyector POLIMORFICO de #EXT-X-APE-QOE-CONTRACT (un tag por canal).
 *
 * POLIMORFICO = funciona con CUALQUIER lista: la tuya del generador (trae
 * ape-profile="P3"), o una externa sin perfil (se resuelve por resolucion y
 * por tokens del nombre). Nunca asume formato.
 *
 * POR PERFIL Y EXCLUSIVO: cada canal toma los knobs de SU perfil
 * (depth/prebuf/stutter/probe/paralelo/readTimeout/min_bw). Dos canales de
 * perfiles distintos no llevan la misma configuracion.
 *
 * NO TOCA NADA MAS: inserta UNA linea tras el #EXTINF y deja el resto
 * byte a byte. Idempotente: si el bloque ya la tiene, se reescribe igual.
 *
 * Stream: 1,38 GB / 22 M de lineas sin cargarlas en memoria.
 * uso:
 *   node tools/ape_qoe_inject_polymorphic.js <in> <out> [--dry-run]
 * ═════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const rl = require('readline');

const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const IN = argv[0], OUT = argv[1];
if (!IN) { console.error('falta entrada'); process.exit(2); }
if (!DRY && !OUT) { console.error('falta salida'); process.exit(2); }

/* ── tabla por perfil: la adaptacion UNICA de cada configuracion ──────────
 * par = descargas paralelas utiles · rt = read-timeout ms · min_bw = exigencia
 * fmax = fps de stutter tolerados (menor = mas estricto) */
const PROFILE_NET = {
  'P0':   { depth: 4, pb: 4, fm: 1, probe: 100, par: 8, rt: 90000, gate: 3.0 },
  'P0.5': { depth: 4, pb: 4, fm: 1, probe: 100, par: 8, rt: 90000, gate: 3.0 },
  'P1':   { depth: 3, pb: 3, fm: 2, probe: 150, par: 6, rt: 75000, gate: 2.5 },
  'P1.5': { depth: 3, pb: 3, fm: 2, probe: 150, par: 6, rt: 75000, gate: 2.5 },
  'P2':   { depth: 3, pb: 3, fm: 2, probe: 150, par: 6, rt: 75000, gate: 2.0 },
  'P2.5': { depth: 3, pb: 3, fm: 2, probe: 150, par: 6, rt: 75000, gate: 2.0 },
  'P3':   { depth: 3, pb: 3, fm: 2, probe: 200, par: 4, rt: 60000, gate: 1.5 },
  'P3.5': { depth: 3, pb: 3, fm: 2, probe: 200, par: 4, rt: 60000, gate: 1.5 },
  'P4':   { depth: 3, pb: 2, fm: 3, probe: 200, par: 3, rt: 60000, gate: 1.3 },
  'P4.5': { depth: 3, pb: 2, fm: 3, probe: 200, par: 3, rt: 60000, gate: 1.3 },
  'P5':   { depth: 3, pb: 2, fm: 3, probe: 200, par: 2, rt: 45000, gate: 1.3 },
  'P5.5': { depth: 3, pb: 2, fm: 3, probe: 200, par: 2, rt: 45000, gate: 1.3 }
};
const PREMIUM = /(DAZN|ESPN|SKY|beIN|BEIN|TNT|HBO|MAX|NBA|NFL|UFC|F1|MOTO ?GP|CHAMPIONS|LIGA|PREMIER|PPV|4K|UHD|HDR|HEVC|H\.?265)/i;

function profileFromName(name) {
  const n = String(name || '');
  if (/\b8K\b|4320p?/i.test(n)) return 'P0.5';
  if (/\b6K\b|3240p?/i.test(n)) return 'P0.5';
  if (/\b4K\b|\bUHD\b|2160p?/i.test(n)) return 'P1';
  if (/\bFHD\b|1080p?/i.test(n)) return 'P3';
  if (/\bHD\b|720p?/i.test(n)) return 'P4';
  if (/\bSD\b|480p?/i.test(n)) return 'P5';
  return null;
}
function profileFromResolution(res, name) {
  const m = String(res || '').match(/(\d{3,4})x(\d{3,4})/);
  let p = profileFromName(name) || 'P5';
  if (m) {
    const h = parseInt(m[2], 10);
    if (h >= 3240) p = 'P0.5'; else if (h >= 2160) p = 'P1';
    else if (h >= 1080) p = 'P3'; else if (h >= 720) p = 'P4'; else p = 'P5';
  }
  if (PREMIUM.test(String(name || ''))) {
    const order = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0.5'];
    const i = order.indexOf(p);
    if (i >= 0 && i < order.length - 1) p = order[i + 1];
  }
  return p;
}
function tierOf(res) {
  const m = String(res || '').match(/(\d{3,4})x(\d{3,4})/);
  if (!m) return null;
  const h = parseInt(m[2], 10);
  if (h >= 4320) return '8K-FAKE';
  if (h >= 3240) return '6K-SIMULATE';
  if (h >= 2160) return '4K-FAKE';
  return null;
}
function contract(ch, prof, res, name) {
  const id = String(ch || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'ch';
  const n = PROFILE_NET[prof] || PROFILE_NET['P3'];
  const o = {
    ch: id, v: 1, p: prof,
    net: { depth: n.depth, pb: n.pb, fm: n.fm, probe: n.probe, par: n.par, rt: n.rt, gate: n.gate },
    cad: { m: 'fixed', v: 'cfr' },
    ott: { hw: 1, hc: 1, mcr: 2, mmp: 0 },
    jit: '/prisma/api/qoe-controller.php',
    truth: 'DECLARED'
  };
  const tier = tierOf(res);
  if (tier) o.tier = tier;
  return '#EXT-X-APE-QOE-CONTRACT:' + JSON.stringify(o);
}

/* ── procesado en stream, con flush por bloques ────────────────────────── */
const out = DRY ? null : fs.createWriteStream(OUT, { encoding: 'utf8', highWaterMark: 1 << 20 });
let buf = [], bufBytes = 0, flushAt = 4 * 1024 * 1024;

async function main() {
  const r = rl.createInterface({ input: fs.createReadStream(IN, { encoding: 'utf8' }), crlfDelay: Infinity });
  let chan = 0, injected = 0, replaced = 0, extraBytes = 0, inChan = false, cur = null, sawTag = false;
  const byProfile = {};

  for await (const line of r) {
    if (line.startsWith('#EXTINF')) {
      chan++; inChan = true; sawTag = false;
      const mid = line.match(/tvg-id="([^"]*)"/);
      const mres = line.match(/(?:ape-resolution|tvg-res)="([^"]*)"/) || line.match(/(\d{3,4}x\d{3,4})/);
      const mpro = line.match(/ape-profile="([^"]*)"/);
      const name = (line.includes(',') ? line.slice(line.lastIndexOf(',') + 1) : '').trim();
      const prof = (mpro && PROFILE_NET[mpro[1].toUpperCase()]) ? mpro[1].toUpperCase()
                 : profileFromResolution(mres ? mres[1] : '', name);
      cur = { id: mid ? mid[1] : '', prof, res: mres ? mres[1] : '', name };
      byProfile[prof] = (byProfile[prof] || 0) + 1;
      if (!DRY) { buf.push(line); bufBytes += line.length + 1; }
      continue;
    }
    if (inChan && line.startsWith('#EXT-X-APE-QOE-CONTRACT')) { sawTag = true; replaced++; }
    if (inChan && line.trim() && line[0] !== '#') {
      if (sawTag) { injected++; inChan = false; cur = null; if (!DRY) { buf.push(line); bufBytes += line.length + 1; } continue; }
      const tag = contract(cur.id, cur.prof, cur.res, cur.name);
      if (!DRY) { buf.push(tag); bufBytes += tag.length + 1; }
      extraBytes += Buffer.byteLength(tag, 'utf8') + 1;
      injected++; inChan = false; cur = null;
    }
    if (!DRY) {
      buf.push(line); bufBytes += line.length + 1;
      if (bufBytes >= flushAt) { out.write(buf.join('\n') + '\n'); buf = []; bufBytes = 0; }
    }
  }
  r.close();
  if (!DRY) {
    if (buf.length) out.write(buf.join('\n') + '\n');
    await new Promise(res => out.end(res));
  }
  const inB = fs.statSync(IN).size;
  console.log((DRY ? 'DRY-RUN ' : 'EMITIDO ') + 'canales=' + chan + ' etiquetas=' + injected
    + ' reemplazadas=' + replaced + ' bytes_extra=' + extraBytes
    + ' salida=' + (DRY ? '(no escrita) ' + (inB + extraBytes) : fs.statSync(OUT).size));
  console.log('por_perfil=' + JSON.stringify(byProfile));
}
main().catch(e => { console.error('ERROR ' + e.message); process.exit(1); });

