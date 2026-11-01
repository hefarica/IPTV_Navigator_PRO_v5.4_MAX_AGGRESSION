#!/usr/bin/env node
/**
 * probe_m3u8_endpoints.js — probe HTTP status of channel URLs in an M3U8 list.
 * Usage: node tools/probe_m3u8_endpoints.js <lista.m3u8|URL> [--sample N] [--range]
 * Output never prints full URLs or credentials; only scheme/host/path category.
 */
'use strict';
const fs = require('fs');
const readline = require('readline');
const { Readable } = require('stream');

const input = process.argv[2];
const sampleArg = process.argv.indexOf('--sample');
const sample = sampleArg > 0 ? Math.max(1, parseInt(process.argv[sampleArg + 1], 10) || 10) : 10;
const useRange = process.argv.includes('--range');
if (!input) { console.error('usage: node tools/probe_m3u8_endpoints.js <lista.m3u8|URL> [--sample N] [--range]'); process.exit(2); }

async function linesFromInput() {
  const isUrl = /^https?:\/\//i.test(input);
  const stream = isUrl ? await fetch(input) : fs.createReadStream(input);
  if (isUrl) {
    if (!stream.ok) throw new Error('list HTTP ' + stream.status);
    return readline.createInterface({ input: Readable.fromWeb(stream.body), crlfDelay: Infinity });
  }
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

function redact(u) {
  try {
    const x = new URL(u);
    return x.protocol + '//' + x.host + '/…/' + (x.pathname.split('/').pop() || '').slice(0, 40);
  } catch (_) { return u.slice(0, 60); }
}

(async () => {
  const rl = await linesFromInput();
  const urls = [];
  let pending = false;
  for await (const line of rl) {
    if (line.startsWith('#EXTINF')) { pending = true; continue; }
    if (pending && /^https?:\/\//i.test(line.trim())) {
      urls.push(line.trim());
      pending = false;
      if (urls.length >= sample) break;
    }
  }
  const results = [];
  for (const url of urls) {
    const headers = {};
    if (useRange) headers.Range = 'bytes=0-1023';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { method: 'GET', headers, redirect: 'manual', signal: ctrl.signal });
      clearTimeout(timer);
      results.push({
        url: redact(url), status: r.status,
        type: r.headers.get('content-type') || '',
        location: r.headers.get('location') ? '(redirect)' : '',
        range: r.headers.get('content-range') || '',
      });
    } catch (e) {
      clearTimeout(timer);
      results.push({ url: redact(url), status: 'error', error: e.message });
    }
  }
  const counts = results.reduce((a, r) => { const k = String(r.status); a[k] = (a[k] || 0) + 1; return a; }, {});
  console.log(JSON.stringify({ input: /^https?:/i.test(input) ? redact(input) : input, sample, range: useRange, counts, results }, null, 2));
  const bad = results.filter(r => !/^(200|206|301|302|307|308)$/.test(String(r.status)));
  if (bad.length) process.exitCode = 1;
})();
