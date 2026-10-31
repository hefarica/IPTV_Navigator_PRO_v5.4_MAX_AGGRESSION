'use strict';

/**
 * X1 · Adaptador canónico (streaming, bounded-memory) para aplicar la capa ARA-X
 * a CUALQUIER lista M3U Plus, con cualquier N (100, miles, 40.000), sin hardcodear
 * el tamaño ni el contenido de los canales.
 *
 * Garantías (ver `verify_synthetic.js`):
 *   · OFF (default) ⇒ salida byte-idéntica a la entrada.
 *   · ON  ⇒ bloque canónico de 27 líneas insertado UNA vez, antes del primer `#EXTINF`,
 *           después del header; idempotente (segunda pasada byte-idéntica).
 *   · per-channel (opt-in) ⇒ directivas derivadas de la evidencia de CADA canal
 *           (isomórfico: mismo canal ⇒ mismas directivas, en cualquier posición).
 *   · 0 canales perdidos · 0 URLs mutadas · 0 duplicados.
 *   · Memoria acotada: una línea + el bloque, independiente de N (nunca bufferiza la lista).
 *   · Fail-open: cualquier error ⇒ se copia la entrada sin tocar.
 *
 * No escribe en `frontend/**`: el adaptador vive en `ara-x/integration/` y se usa
 * (a) como implementación de referencia y (b) por la CLI/streaming de verificación.
 * El hook del navegador (`ara-x-hook.js`) comparte las mismas reglas puras.
 */

const fs = require('node:fs');
const path = require('node:path');

const hook = require('./ara-x-hook.js');

const MAX_LINE_BYTES = 1024 * 1024; // 1 MiB: una línea real nunca se acerca
const SCOPE_ON = { ARA_X_ENABLED: true };
const SCOPE_ON_PER = { ARA_X_ENABLED: true, ARA_X_PER_CHANNEL: true };

function isExtinf(text) {
  return typeof text === 'string' && text.indexOf('#EXTINF') === 0;
}

/**
 * Escáner de líneas con EOL preservado y buffer acotado.
 * onLine({ text, eol }); stats.maxPending = máximo de bytes pendientes sin '\n'.
 */
function makeScanner(onLine, stats) {
  let pending = '';
  const st = stats || { maxPending: 0, lines: 0 };
  const emit = (text, eol) => { st.lines++; onLine({ text, eol }); };
  return {
    push(chunk) {
      pending += chunk;
      st.maxPending = Math.max(st.maxPending, pending.length);
      if (pending.length > MAX_LINE_BYTES) throw new Error('E_LINE_TOO_LONG');
      let idx;
      while ((idx = pending.indexOf('\n')) !== -1) {
        const raw = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        const cr = raw.endsWith('\r');
        emit(cr ? raw.slice(0, -1) : raw, cr ? '\r\n' : '\n');
      }
    },
    end() {
      if (pending.length) {
        const cr = pending.endsWith('\r');
        emit(cr ? pending.slice(0, -1) : pending, cr ? '\r\n' : '');
        pending = '';
      }
    },
    stats: st
  };
}

/**
 * Versión simple y correcta para strings: recorre líneas y devuelve un array
 * de { text, eol }. Usada por `transformText` y por los tests.
 */
function toLines(text) {
  const out = [];
  if (typeof text !== 'string' || text.length === 0) return out;
  let i = 0;
  while (i < text.length) {
    const nl = text.indexOf('\n', i);
    if (nl === -1) {
      out.push({ text: text.slice(i), eol: '' });
      break;
    }
    const raw = text.slice(i, nl);
    const cr = raw.endsWith('\r');
    out.push({ text: cr ? raw.slice(0, -1) : raw, eol: cr ? '\r\n' : '\n' });
    i = nl + 1;
  }
  return out;
}

function linesToString(lines) {
  let out = '';
  for (const l of lines) out += l.text + l.eol;
  return out;
}

/**
 * Aplica la capa sobre un string. `opts`: { enabled, perChannel, listVersion }.
 * Devuelve el string transformado (o el mismo si OFF / ya presente / error).
 */
function transformText(text, opts) {
  const o = opts || {};
  try {
    if (typeof text !== 'string') return text;
    if (!o.enabled) return text;
    const input = toLines(text);
    let seenFirstExtinf = false;
    let already = false;
    const block = hook.buildGlobalBlock({ listVersion: o.listVersion });
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const l = input[i];
      if (!seenFirstExtinf && l.text.indexOf('#EXT-X-ARA-VERSION:') === 0) already = true;
      if (!seenFirstExtinf && isExtinf(l.text)) {
        seenFirstExtinf = true;
        if (!already) for (const b of block) out.push({ text: b, eol: l.eol });
      }
      out.push(l);
      if (o.perChannel && isExtinf(l.text)) {
        const next = input[i + 1];
        const alreadyPresent = next && next.text.indexOf('#EXT-X-ARA-') === 0;
        if (!alreadyPresent) {
          for (const d of hook.channelDirectives(l.text)) out.push({ text: d, eol: l.eol });
        }
      }
    }
    return linesToString(out);
  } catch (_) {
    return text;
  }
}

/**
 * Transforma un fichero con memoria acotada (streaming real): no carga la lista,
 * sólo una línea y el bloque. Si algo falla, copia la entrada sin tocar (fail-open).
 * Devuelve { ok, bytesIn, bytesOut, stats }.
 */
async function transformFile(inPath, outPath, opts) {
  const o = opts || {};
  const stats = { maxPending: 0, lines: 0, injected: false, failOpen: false };
  try {
    if (!o.enabled) {
      fs.copyFileSync(inPath, outPath);
      return { ok: true, bytesIn: fs.statSync(inPath).size, bytesOut: fs.statSync(outPath).size, stats, mode: 'off' };
    }
    const readStream = fs.createReadStream(inPath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const writeStream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    const block = hook.buildGlobalBlock({ listVersion: o.listVersion });
    let seenFirstExtinf = false;
    let already = false;
    let injected = false;
    let streamError = null;
    writeStream.on('error', (err) => { streamError = err; });
    const write = (s) => new Promise((resolve) => {
      if (streamError) return resolve();
      if (writeStream.write(s)) return resolve();
      writeStream.once('drain', resolve);
    });
    let chain = Promise.resolve();
    let pendingPer = null;
    const takePending = () => {
      if (!pendingPer) return '';
      const s = pendingPer.dirs.map((d) => d + pendingPer.eol).join('');
      pendingPer = null;
      return s;
    };
    const scanner = makeScanner(({ text, eol }) => {
      chain = chain.then(() => {
        // Si venimos de un #EXTINF con directivas pendientes:
        if (pendingPer) {
          if (text.indexOf('#EXT-X-ARA-') === 0) { pendingPer = null; return write(text + eol); } // ya presentes
          const flush = takePending();
          return write(flush + text + eol);
        }
        if (!seenFirstExtinf && text.indexOf('#EXT-X-ARA-VERSION:') === 0) already = true;
        let prefix = '';
        if (!seenFirstExtinf && isExtinf(text)) {
          seenFirstExtinf = true;
          if (!already && !injected) { injected = true; prefix = block.map((b) => b + eol).join(''); }
        }
        // Per-channel: se difiere la inserción una línea para detectar directivas ya presentes.
        if (o.perChannel && isExtinf(text)) {
          const dirs = hook.channelDirectives(text);
          if (dirs.length) pendingPer = { dirs, eol };
        }
        return write(prefix + text + eol);
      });
    }, stats);
    for await (const chunk of readStream) {
      scanner.push(chunk);
      await chain;
      chain = Promise.resolve();
    }
    scanner.end();
    chain = chain.then(() => write(takePending()));
    await chain;
    await new Promise((resolve, reject) => { writeStream.end((err) => (err ? reject(err) : resolve())); });
    stats.injected = injected;
    return { ok: true, bytesIn: fs.statSync(inPath).size, bytesOut: fs.statSync(outPath).size, stats, mode: 'on' };
  } catch (err) {
    try { fs.copyFileSync(inPath, outPath); } catch (_) { /* noop */ }
    stats.failOpen = true;
    return { ok: true, bytesIn: fs.existsSync(inPath) ? fs.statSync(inPath).size : 0, bytesOut: fs.existsSync(outPath) ? fs.statSync(outPath).size : 0, stats, mode: 'fail-open', error: String(err && err.message ? err.message : err) };
  }
}

/** Atajo de línea de comandos: node ara_x_adapter.js <in> <out> [--on] [--per] [--list-version v] */
function main(argv) {
  const args = argv.slice(2);
  const inPath = args[0];
  const outPath = args[1];
  if (!inPath || !outPath) {
    console.error('uso: node ara_x_adapter.js <in.m3u8> <out.m3u8> [--on] [--per] [--list-version V]');
    process.exit(2);
  }
  const opts = {
    enabled: args.includes('--on'),
    perChannel: args.includes('--per'),
    listVersion: (() => { const i = args.indexOf('--list-version'); return i !== -1 ? args[i + 1] : 'unknown'; })()
  };
  transformFile(inPath, outPath, opts).then((r) => {
    console.log(JSON.stringify(r));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = {
  MAX_LINE_BYTES,
  buildGlobalBlock: hook.buildGlobalBlock,
  channelDirectives: hook.channelDirectives,
  toLines,
  linesToString,
  transformText,
  transformFile,
  main
};

if (require.main === module) main(process.argv);
