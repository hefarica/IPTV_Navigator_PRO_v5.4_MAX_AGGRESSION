#!/usr/bin/env node
/**
 * ape-pulse-master.cjs — modo `--format hls-master`.
 *
 * Un maestro HLS no es un catálogo IPTV. Este modo:
 *   - exige #EXTM3U y una estructura de maestro;
 *   - conserva cada #EXT-X-STREAM-INF seguido de SU URI (con atributos intactos);
 *   - conserva #EXT-X-I-FRAME-STREAM-INF, #EXT-X-MEDIA y metadatos de maestro;
 *   - retira solo la metadata IPTV (EXTSHIMOTT/EXTHTTP/EXTVLCOPT/KODIPROP/APE);
 *   - rechaza catálogos, listas de segmentos, pares rotos y mezclas.
 *
 * No envuelve URLs ni toca /pulse. La salida es maestra, no catálogo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MASTER_ONLY = /^#EXT-X-(?:STREAM-INF|I-FRAME-STREAM-INF|MEDIA|SESSION-DATA|SESSION-KEY|CONTENT-STEERING|IMAGE-STREAM-INF):/;
const MEDIA_ONLY = /^#(?:EXTINF:|EXT-X-(?:TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY(?:-SEQUENCE)?|ENDLIST|PLAYLIST-TYPE|I-FRAMES-ONLY|KEY|MAP|BYTERANGE|PROGRAM-DATE-TIME|DATERANGE|PART|PART-INF|PRELOAD-HINT|SERVER-CONTROL|SKIP|GAP|BITRATE|RENDITION-REPORT)(?::|$))/;
const IPTV_META = /^#(?:EXTSHIMOTT:|EXTHTTP:|EXTVLCOPT:|KODIPROP:|EXTGRP:|EXT-X-APE-)/;

function run(args, wrapperVersion) {
  try {
    if (typeof args.in !== 'string' || typeof args.out !== 'string' || !args.in || !args.out) {
      throw new Error('uso: --format hls-master --in <maestro> --out <dst>');
    }
    const input = fs.realpathSync(args.in);
    const raw = fs.readFileSync(input);
    const text = (input.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (!lines.length || lines[0].trim() !== '#EXTM3U') {
      throw new Error('hls-master requiere una cabecera #EXTM3U');
    }

    const output = [];
    let variantPending = false;
    let variants = 0;
    let urls = 0;
    let sawMaster = false;
    const sha = crypto.createHash('sha256');

    const write = (line) => {
      const value = line + eol;
      sha.update(value, 'utf8');
      output.push(value);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === lines.length - 1 && line === '') continue;
      if (MEDIA_ONLY.test(line)) {
        throw new Error('hls-master no admite listas de segmentos ni catálogos (línea ' + (i + 1) + ')');
      }
      if (IPTV_META.test(line)) continue;
      if (variantPending) {
        if (!line || line.startsWith('#') || /\s/.test(line)) {
          throw new Error('Falta URI inmediatamente después de #EXT-X-STREAM-INF (línea ' + (i + 1) + ')');
        }
        variantPending = false;
        variants++;
        urls++;
        write(line);
        continue;
      }
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        sawMaster = true;
        variantPending = true;
        write(line);
        continue;
      }
      if (line.trim() && !line.startsWith('#')) {
        throw new Error('URI sin #EXT-X-STREAM-INF en hls-master (línea ' + (i + 1) + ')');
      }
      if (/^#EXT-X-(?:I-FRAME-STREAM-INF|MEDIA):/.test(line)) {
        sawMaster = true;
      }
      if (MASTER_ONLY.test(line)) sawMaster = true;
      write(line);
    }
    if (variantPending) throw new Error('hls-master termina con #EXT-X-STREAM-INF sin URI');
    if (!sawMaster) throw new Error('el fichero no contiene ninguna estructura de maestro HLS');

    const tmp = args.out + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, output.join(''));
    fs.renameSync(tmp, args.out);
    const result = {
      format: 'hls-master',
      wrapper: wrapperVersion,
      status: 'MASTER_WRITTEN',
      in: args.in,
      out: args.out,
      variants,
      urls,
      sha256: sha.digest('hex'),
      bytes: fs.statSync(args.out).size,
      bytes_in: raw.length,
    };
    if (!args.quiet) console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('master-error:', error && error.message ? error.message : error);
    process.exitCode = 1;
    return null;
  }
}

module.exports = { run };
