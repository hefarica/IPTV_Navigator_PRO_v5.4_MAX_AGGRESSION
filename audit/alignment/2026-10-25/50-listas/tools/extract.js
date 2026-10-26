#!/usr/bin/env node
/* extract.js — presenta el informe de lists_audit.js de forma compacta para el auditor */
'use strict';
const fs = require('fs');
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mode = process.argv[3] || 'table';
const R = rep.files.filter((f) => !f.error);

if (mode === 'table') {
  console.log('| archivo | bytes | lineas | EXTINF | URIs | STREAM-INF | c/audio | sinSTREAMINF | EXTHTTP | JSONfail | toxicos | hev1-STREAMINF | hvc1-en-VLC/KODI | MEDIA_URI | IFRAME_URI | VRdup | imposibles | multiURL | dupURL | tvg faltantes |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of R) {
    const tox = r.exthttp.toxic && Object.keys(r.exthttp.toxic).length ? JSON.stringify(r.exthttp.toxic) : '0';
    console.log('| ' + [
      r.file.split('/').pop(), r.bytes, r.lines, r.extinf, r.uriLines, r.streamInf.count,
      r.streamInf.withCodecs, r.extinf - r.streamInf.count, r.exthttp.count, r.exthttp.jsonFail, tox,
      r.golden.hev1InStreamInf, (r.golden.hvc1InVlcopt + r.golden.hvc1InKodiprop),
      r.media.withUri, r.iframe.withUri, r.streamInf.videoRangeDup, r.impossible.count,
      r.multiUrl.channels, r.dupUrl.count,
      `${r.tvg.missingId}/${r.tvg.missingName}/${r.tvg.missingGroup}/${r.tvg.missingLogo}`,
    ].join(' | ') + ' |');
  }
}

if (mode === 'detail') {
  for (const r of R) {
    const issues = [];
    if (r.exthttp.jsonFail) issues.push(`EXTHTTP JSON invalido: ${r.exthttp.jsonFail} (muestras: ${JSON.stringify(r.exthttp.failSamples)})`);
    if (r.exthttp.toxic && Object.keys(r.exthttp.toxic).length) issues.push(`EXTHTTP toxicos: ${JSON.stringify(r.exthttp.toxic)}`);
    if (r.exthttp.waf && Object.keys(r.exthttp.waf).length) issues.push(`EXTHTTP WAF: ${JSON.stringify(r.exthttp.waf)}`);
    if (r.golden.hev1InStreamInf) issues.push(`GOLDEN: hev1 en STREAM-INF x${r.golden.hev1InStreamInf} lineas ${JSON.stringify(r.golden.hev1Lines)}`);
    if (r.golden.hvc1InVlcopt) issues.push(`GOLDEN: hvc1 en EXTVLCOPT x${r.golden.hvc1InVlcopt}`);
    if (r.golden.hvc1InKodiprop) issues.push(`GOLDEN: hvc1 en KODIPROP x${r.golden.hvc1InKodiprop} lineas ${JSON.stringify(r.golden.hvc1SideLines)}`);
    if (r.media.withUri) issues.push(`EXT-X-MEDIA con URI: ${r.media.withUri} ${JSON.stringify(r.media.uriLines)}`);
    if (r.iframe.withUri) issues.push(`I-FRAME con URI: ${r.iframe.withUri}`);
    if (r.iframe.count && !r.iframe.withUri) issues.push(`I-FRAME SIN URI (RFC): ${r.iframe.count}`);
    if (r.streamInf.videoRangeDup) issues.push(`VIDEO-RANGE duplicado: ${r.streamInf.videoRangeDup} ${JSON.stringify(r.streamInf.dupLines)}`);
    if (r.impossible.count) issues.push(`LUCHA NIVEL<RESOLUCION: ${r.impossible.count} muestras=${JSON.stringify(r.impossible.samples.slice(0, 4))}`);
    if (r.multiUrl.channels) issues.push(`MULTI-URL/canal: ${r.multiUrl.channels} (max ${r.multiUrl.maxUrls}) ${JSON.stringify(r.multiUrl.samples.slice(0, 3))}`);
    if (r.extm3u.count !== 1) issues.push(`EXTM3U count=${r.extm3u.count} line=${r.extm3u.line}`);
    if (Object.keys(r.mediaPlaylistTags).length) issues.push(`MEDIA-PLAYLIST TAGS en catalogo: ${JSON.stringify(r.mediaPlaylistTags)}`);
    if (r.targetDuration !== null) issues.push(`TARGETDURATION=${r.targetDuration}`);
    if (r.extinfDuration.notOne) issues.push(`EXTINF con duracion != -1: ${r.extinfDuration.notOne} ${r.extinfDuration.sample}`);
    console.log(`\n### ${r.file}  (${r.bytes} B, ${r.lines} lineas, ${r.channels} canales, sha ${r.sha256.slice(0, 16)}…)`);
    console.log(`  tags: ${JSON.stringify(r.tagCounts)}`);
    console.log(`  golden counts: ${JSON.stringify(r.golden.counts)}`);
    console.log(`  pares RES|BW|CODECS|VR distintos: ${r.pairCount}`);
    for (const [k, v] of Object.entries(r.pairs).slice(0, 12)) console.log(`    ${v}\t${k}`);
    for (const i of issues) console.log(`  !! ${i}`);
    if (r.exthttp.samples.length) console.log(`  EXTHTTP muestra: ${r.exthttp.samples[0].slice(0, 300)}`);
  }
}
