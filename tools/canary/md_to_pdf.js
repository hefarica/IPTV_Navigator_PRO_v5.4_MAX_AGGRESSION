#!/usr/bin/env node
/**
 * md_to_pdf.js — conversor markdown -> HTML autocontenido -> PDF con Chrome headless.
 *
 * REQUISITOS DELIBERADOS:
 *   - CERO dependencias externas: no se usa node_modules. Requiere SOLO modulos core de Node:
 *       fs, path, child_process
 *     No se usa `crypto`: el sha256 se implementa aqui abajo en JS puro y se autoverifica
 *     contra los vectores conocidos ("" y "abc") en cada arranque. Asi el listado de requires
 *     es exactamente el que pide el encargo y el hash sigue siendo verificable.
 *   - CERO red: no se descarga nada, no hay CDN, no hay fuentes externas (solo fuentes del sistema).
 *   - El PDF lo imprime Chrome headless con --print-to-pdf sobre un file:// local.
 *
 * USO:
 *   node tools/canary/md_to_pdf.js --out <salida.pdf> --title "<titulo>" [--subtitle "..."]
 *        --source <a.md> [--source <b.md> ...] [--chrome <ruta>] [--profile <dir>]
 *        [--html-out <ruta>] [--selftest]
 *
 * Salida: un JSON de una linea con ok, ruta, bytes, sha256, ms, sources[] y el comando exacto.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 en JS puro (sin require('crypto')). Autoverificado abajo.
// ─────────────────────────────────────────────────────────────────────────────
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function sha256hex(buf) {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = buf.length;
  const bitLen = len * 8;
  const padLen = (len + 9 + 63) & ~63;
  const m = Buffer.alloc(padLen);
  buf.copy(m, 0);
  m[len] = 0x80;
  m.writeUInt32BE(Math.floor(bitLen / 0x100000000) >>> 0, padLen - 8);
  m.writeUInt32BE(bitLen >>> 0, padLen - 4);
  const w = new Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = m.readUInt32BE(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K256[t] + w[t]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

const VECTORS = {
  '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'abc': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
};
function selftest() {
  const bad = [];
  for (const k of Object.keys(VECTORS)) {
    const got = sha256hex(Buffer.from(k, 'utf8'));
    if (got !== VECTORS[k]) bad.push(JSON.stringify(k) + ': esperado ' + VECTORS[k] + ' obtenido ' + got);
  }
  return bad;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escapado y formato inline
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  let t = esc(s);
  // code inline primero, para que no se le aplique negrita/cursiva dentro
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000C' + (codes.length - 1) + '\u0000'; });
  // enlaces [texto](url)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => '<a href="' + url.replace(/"/g, '&quot;') + '">' + txt + '</a>');
  // negrita, cursiva, tachado
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // restaurar code inline
  t = t.replace(/\u0000C(\d+)\u0000/g, (m, i) => '<code>' + codes[Number(i)] + '</code>');
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversor markdown -> HTML (bloques)
// ─────────────────────────────────────────────────────────────────────────────
const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_FENCE = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/;
const RE_HR = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const out = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { out.push(cur); cur = ''; continue; }
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function convertMarkdown(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let stats = { h1: 0, h2: 0, h3: 0, h4: 0, tables: 0, codes: 0, lists: 0, links: 0, images: 0 };

  while (i < lines.length) {
    const line = lines[i];

    // fence
    let m = line.match(RE_FENCE);
    if (m) {
      const fence = m[1];
      const lang = m[2] || '';
      const buf = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s*' + fence[0] + '{3,}\\s*$').test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // cierre
      stats.codes++;
      html.push('<pre class="code"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // heading
    m = line.match(RE_HEADING);
    if (m) {
      const lvl = m[1].length;
      if (lvl === 1) stats.h1++; else if (lvl === 2) stats.h2++; else if (lvl === 3) stats.h3++; else stats.h4++;
      html.push('<h' + lvl + '>' + inline(m[2].replace(/\s*#+\s*$/, '')) + '</h' + lvl + '>');
      i++;
      continue;
    }

    // hr
    if (RE_HR.test(line)) { html.push('<hr>'); i++; continue; }

    // tabla GFM: cabecera + separador
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('|')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(splitRow(lines[i])); i++; }
      stats.tables++;
      html.push('<div class="tw"><table><thead><tr>' + head.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    // blockquote
    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { buf.push(lines[i].match(RE_QUOTE)[1]); i++; }
      html.push('<blockquote>' + convertMarkdown(buf.join('\n')) + '</blockquote>');
      continue;
    }

    // listas (solo un nivel de anidamiento por indentacion de 2+ espacios)
    if (RE_LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && RE_LIST.test(lines[i])) {
        const mm = lines[i].match(RE_LIST);
        const depth = Math.floor(mm[1].length / 2);
        items.push({ depth, text: mm[3] });
        i++;
      }
      stats.lists++;
      const tag = ordered ? 'ol' : 'ul';
      let out = '<' + tag + '>';
      let open = 0;
      for (const it of items) {
        const d = Math.min(it.depth, 2);
        while (open < d) { out += '<' + tag + '>'; open++; }
        while (open > d) { out += '</' + tag + '>'; open--; }
        out += '<li>' + inline(it.text) + '</li>';
      }
      while (open > 0) { out += '</' + tag + '>'; open--; }
      out += '</' + tag + '>';
      html.push(out);
      continue;
    }

    // parrafo
    if (line.trim() !== '') {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && !RE_HEADING.test(lines[i]) && !RE_FENCE.test(lines[i]) && !RE_LIST.test(lines[i]) && !RE_QUOTE.test(lines[i]) && !RE_HR.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      if (buf.length) html.push('<p>' + inline(buf.join(' ')) + '</p>');
      continue;
    }

    i++;
  }

  const joined = html.join('\n');
  stats.links = (joined.match(/<a /g) || []).length;
  stats.images = (joined.match(/<img /g) || []).length;
  return { html: joined, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS de impresion (sin fuentes externas: solo pila del sistema)
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
       font-size: 10.5pt; line-height: 1.45; color: #111; }
h1, h2, h3, h4, h5, h6 { font-family: inherit; line-height: 1.2; margin: 1.1em 0 0.45em; page-break-after: avoid; }
h1 { font-size: 19pt; border-bottom: 2px solid #111; padding-bottom: 4px; }
h2 { font-size: 15pt; border-bottom: 1px solid #bbb; padding-bottom: 3px; }
h3 { font-size: 12.5pt; }
h4 { font-size: 11pt; }
p { margin: 0.5em 0; text-align: left; }
ul, ol { margin: 0.45em 0 0.45em 1.4em; padding: 0; }
li { margin: 0.15em 0; }
code { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 0.88em;
       background: #f2f3f5; border: 1px solid #dcdcdc; border-radius: 3px; padding: 0 3px; }
pre.code { background: #f6f7f9; border: 1px solid #d9d9d9; border-left: 3px solid #555; border-radius: 3px;
       padding: 7px 9px; margin: 0.6em 0; overflow: visible; page-break-inside: auto;
       font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 8.4pt; line-height: 1.35; }
pre.code code { background: none; border: 0; padding: 0; font-size: inherit; }
pre.code { white-space: pre-wrap; word-break: break-word; }
blockquote { margin: 0.6em 0; padding: 0.2em 0 0.2em 0.9em; border-left: 3px solid #999; color: #333; background: #fafafa; }
table { border-collapse: collapse; width: 100%; margin: 0.55em 0; font-size: 8.6pt; }
th, td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; text-align: left; }
th { background: #eceef1; font-weight: 600; }
tbody tr:nth-child(even) td { background: #fafafa; }
.tw { page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
a { color: #0b4f9c; text-decoration: none; }
hr { border: 0; border-top: 1px solid #bbb; margin: 1em 0; }
.cover { page-break-after: always; }
.cover h1 { border: 0; font-size: 26pt; margin: 0 0 6px; }
.cover .sub { font-size: 12pt; color: #444; margin: 0 0 22px; }
.cover .badge { display: inline-block; border: 1px solid #111; border-radius: 3px; padding: 3px 8px;
       font-size: 9pt; font-weight: 600; margin-bottom: 18px; }
.cover .note { font-size: 9.5pt; background: #f6f7f9; border-left: 3px solid #555; padding: 8px 10px; margin: 14px 0; }
.cover table { font-size: 8.4pt; }
.cover .cmd { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8pt; background: #f6f7f9;
       border: 1px solid #d9d9d9; padding: 7px 9px; white-space: pre-wrap; word-break: break-word; }
.sec-head { border-top: 2px solid #111; margin-top: 0; padding-top: 8px; page-break-before: always; }
.sec-head .meta { font-size: 8.2pt; color: #444; font-family: "Cascadia Mono", Consolas, monospace; }
.sec-head h2 { border: 0; font-size: 14pt; margin: 4px 0 2px; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Argumentos
// ─────────────────────────────────────────────────────────────────────────────
function argOf(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === '--' + name && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]); });
  return out;
}

const SELFTEST_ONLY = process.argv.includes('--selftest');
const st = selftest();
if (st.length) { console.error('SELFTEST_SHA256_FAIL: ' + st.join(' | ')); process.exit(2); }
if (SELFTEST_ONLY) { console.log(JSON.stringify({ ok: true, selftest: 'sha256 vectores "" y "abc" OK', requires: ['fs', 'path', 'child_process'] })); process.exit(0); }

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..', '..');
const out = argOf('out', '');
const title = argOf('title', 'Documento');
const subtitle = argOf('subtitle', '');
const sources = argAll('source');
const chromeBin = argOf('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const profile = argOf('profile', path.join(process.env.TEMP || process.env.TMP || '.', 'canary_pdf_profile'));
const htmlOut = argOf('html-out', '');
const commit = argOf('commit', '');

if (!out) { console.error('FALTA --out <salida.pdf>'); process.exit(2); }
if (!sources.length) { console.error('FALTA --source <fichero.md>'); process.exit(2); }

const srcMeta = [];
for (const s of sources) {
  const abs = path.isAbsolute(s) ? s : path.resolve(ROOT, s);
  if (!fs.existsSync(abs)) { console.error('FUENTE_NO_EXISTE: ' + s); process.exit(3); }
  const buf = fs.readFileSync(abs);
  srcMeta.push({ rel: path.relative(ROOT, abs).replace(/\\/g, '/'), abs, bytes: buf.length, sha256: sha256hex(buf), md: buf.toString('utf8') });
}

// comando exacto (reproducible)
const chromeArgs = ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
  '--offline', '--disable-background-networking', '--no-pdf-header-footer', '--user-data-dir=' + profile, '--print-to-pdf=' + out];
const exactCmd = '"' + chromeBin + '" ' + chromeArgs.map(a => (a.indexOf(' ') > -1 ? '"' + a + '"' : a)).join(' ') + ' "file:///<html>"';
const nodeCmd = 'node tools/canary/md_to_pdf.js --out ' + out +
  ' --title "' + title + '"' + (subtitle ? ' --subtitle "' + subtitle + '"' : '') +
  sources.map(s => ' --source ' + s).join('') + (commit ? ' --commit ' + commit : '');

const nowIso = new Date().toISOString();
const parts = [];
parts.push('<div class="cover">');
parts.push('<div class="badge">ENTREGABLE OFICIAL · generado por herramientas del repo</div>');
parts.push('<h1>' + esc(title) + '</h1>');
if (subtitle) parts.push('<div class="sub">' + esc(subtitle) + '</div>');
parts.push('<div class="note"><strong>Este PDF se genera del markdown real del repositorio, no es una reconstrucción.</strong><br>' +
  'Cada sección es el contenido literal de un fichero existente, con su sha256 calculado en el momento de la generación. ' +
  'Si el markdown cambia, el sha256 de esta portada deja de casar: eso es lo que permite detectar que el PDF quedó obsoleto.</div>');
parts.push('<table><thead><tr><th>Fichero de origen</th><th style="width:70px">Bytes</th><th style="width:300px">sha256</th></tr></thead><tbody>');
for (const s of srcMeta) parts.push('<tr><td><code>' + esc(s.rel) + '</code></td><td>' + s.bytes + '</td><td><code>' + s.sha256 + '</code></td></tr>');
parts.push('</tbody></table>');
parts.push('<p style="font-size:9pt"><strong>Fecha de generación:</strong> ' + esc(nowIso) + (commit ? ' · <strong>base git:</strong> <code>' + esc(commit) + '</code>' : '') + '</p>');
parts.push('<p style="font-size:9pt;margin-top:12px"><strong>Comando completo de generación (conversor + Chrome)</strong></p>');
parts.push('<div class="cmd">' + esc(nodeCmd) + '</div>');
parts.push('<p style="font-size:9pt;margin-top:8px"><strong>Comando exacto de impresión (Chrome)</strong></p>');
parts.push('<div class="cmd">' + esc(exactCmd) + '</div>');
parts.push('<p style="font-size:8.6pt;color:#444">Converter: <code>node tools/canary/md_to_pdf.js</code> — sin dependencias externas ' +
  '(solo <code>fs</code>, <code>path</code>, <code>child_process</code>) y sin red: los PDF se imprimen con Chrome headless sobre un <code>file://</code> local.</p>');
parts.push('</div>');

const allStats = { h1: 0, h2: 0, h3: 0, h4: 0, tables: 0, codes: 0, lists: 0, links: 0, images: 0 };
for (const s of srcMeta) {
  const { html, stats } = convertMarkdown(s.md);
  for (const k of Object.keys(allStats)) allStats[k] += stats[k] || 0;
  parts.push('<div class="sec-head">');
  parts.push('<h2>' + esc(s.rel) + '</h2>');
  parts.push('<div class="meta">' + s.bytes + ' B · sha256 ' + s.sha256 + '</div>');
  parts.push('</div>');
  parts.push(html);
}

const htmlDoc = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>' + parts.join('\n') + '</body></html>';

const tmpDir = path.join(process.env.TEMP || '.', 'canary_pdf_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
const htmlPath = htmlOut || path.join(tmpDir, 'doc.html');
fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
fs.writeFileSync(htmlPath, htmlDoc, 'utf8');
if (!fs.existsSync(profile)) fs.mkdirSync(profile, { recursive: true });

const pdfAbs = path.isAbsolute(out) ? out : path.resolve(ROOT, out);
fs.mkdirSync(path.dirname(pdfAbs), { recursive: true });
const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('C%3A', 'C:');

const args = chromeArgs.map(a => (a.startsWith('--print-to-pdf=') ? '--print-to-pdf=' + pdfAbs : a));
const t0 = Date.now();
const r = spawnSync(chromeBin, args.concat([fileUrl]), { encoding: 'utf8', timeout: 300000, windowsHide: true });
const ms = Date.now() - t0;

let ok = false, bytes = 0, sha = '', header = '', error = null;
if (r.error) error = 'SPAWN_ERROR ' + r.error.message;
else if (r.status !== 0) error = 'CHROME_EXIT ' + r.status + ' :: ' + String(r.stderr || '').slice(0, 400);
if (fs.existsSync(pdfAbs)) {
  const buf = fs.readFileSync(pdfAbs);
  bytes = buf.length;
  header = buf.slice(0, 5).toString('latin1');
  sha = sha256hex(buf);
  const tail = buf.slice(Math.max(0, buf.length - 32)).toString('latin1');
  ok = header === '%PDF-' && bytes > 1000 && /%%EOF/.test(tail);
  if (!ok && !error) error = 'PDF_INVALIDO header=' + JSON.stringify(header) + ' bytes=' + bytes + ' eof=' + /%%EOF/.test(tail);
} else if (!error) error = 'PDF_NO_GENERADO';

console.log(JSON.stringify({
  ok, out: path.relative(ROOT, pdfAbs).replace(/\\/g, '/'), bytes, sha256: sha, header, ms,
  html: path.relative(ROOT, htmlPath).replace(/\\/g, '/'), htmlBytes: Buffer.byteLength(htmlDoc, 'utf8'),
  command: '"' + chromeBin + '" ' + args.concat([fileUrl]).join(' '),
  sources: srcMeta.map(s => ({ path: s.rel, bytes: s.bytes, sha256: s.sha256 })),
  content: allStats, error
}, null, 0));
process.exit(ok ? 0 : 1);
