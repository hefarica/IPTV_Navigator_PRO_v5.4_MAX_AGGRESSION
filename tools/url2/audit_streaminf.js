#!/usr/bin/env node
'use strict';
/**
 * audit_streaminf.js — cuenta atributos declarados en #EXT-X-STREAM-INF y
 * #EXT-X-I-FRAME-STREAM-INF (RESOLUTION, CODECS, FRAME-RATE, VIDEO-RANGE,
 * HDCP-LEVEL, BANDWIDTH) para saber QUÉ se está declarando por canal.
 * Uso: node audit_streaminf.js <lista.m3u8>
 */
const fs = require('fs');
const readline = require('readline');

const file = process.argv[2];
if (!file) { console.error('uso: node audit_streaminf.js <lista>'); process.exit(2); }

const res = {}, codecs = {}, fps = {}, range = {}, hdcp = {}, bw = {};
let n = 0, iframe = 0, iframeNoUri = 0;
const attr = (line, key) => {
  const m = new RegExp(key + '=("([^"]*)"|[^,]*)').exec(line);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[1];
};
const bump = (o, k) => { if (k === null) k = '(ausente)'; o[k] = (o[k] || 0) + 1; };

const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
    iframe++;
    if (!/URI=/.test(line)) iframeNoUri++;
    return;
  }
  if (!line.startsWith('#EXT-X-STREAM-INF')) return;
  n++;
  bump(res, attr(line, 'RESOLUTION'));
  bump(codecs, attr(line, 'CODECS'));
  bump(fps, attr(line, 'FRAME-RATE'));
  bump(range, attr(line, 'VIDEO-RANGE'));
  bump(hdcp, attr(line, 'HDCP-LEVEL'));
  bump(bw, attr(line, 'BANDWIDTH'));
});
rl.on('close', () => {
  const top = (o, k = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
  console.log(JSON.stringify({
    stream_inf: n, iframe, iframe_sin_uri: iframeNoUri,
    resolution: Object.fromEntries(top(res)),
    codecs: Object.fromEntries(top(codecs)),
    frame_rate: Object.fromEntries(top(fps)),
    video_range: Object.fromEntries(top(range)),
    hdcp: Object.fromEntries(top(hdcp)),
    bandwidth_top: Object.fromEntries(top(bw)),
  }, null, 2));
});
