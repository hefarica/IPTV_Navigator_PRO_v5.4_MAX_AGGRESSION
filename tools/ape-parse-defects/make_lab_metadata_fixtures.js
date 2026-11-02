#!/usr/bin/env node
/**
 * make_lab_metadata_fixtures.js — genera los fixtures del validador de metadata chunked.
 *
 * Por que existe: `lab_metadata_decode.js` se equivoco TRES veces en la misma ronda y las tres aprobo
 * en silencio. Un validador sin fixture que lo haga fallar a proposito es un validador que nadie sabe
 * si mira. Estos dos ficheros son el par minimo:
 *
 *   labmeta_ok.m3u8      metadata coherente  -> el validador DEBE salir 0
 *   labmeta_mal.m3u8     metadata con los cinco tipos de defecto -> el validador DEBE salir 4
 *                                                   y nombrar cada uno
 *
 * El fixture malo reproduce los defectos REALES encontrados en la lista de 604 MB, no inventados:
 * abrBandWidthFactor como porcentaje, audio_passthrough sin rendition, L1 en 8K sin escalador,
 * buffer_seconds fuera de bounds, y el mismo parametro dos veces con valores distintos.
 *
 * Uso: node tools/ape-parse-defects/make_lab_metadata_fixtures.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'fixtures');

/** Divide un objeto en n chunks base64 y devuelve las lineas del tag. */
function chunks(obj, n = 20) {
  const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  const tam = Math.ceil(b64.length / n);
  const trozos = [];
  for (let i = 0; i < b64.length; i += tam) trozos.push(b64.slice(i, i + tam));
  return trozos.map((t, i) => `#EXT-X-APE-LAB-METADATA:${i + 1}/${trozos.length}:${t}`);
}

const cabecera = ['#EXTM3U', '#EXT-X-VERSION:6', '#EXT-X-TARGETDURATION:6'];

// ── COHERENTE ────────────────────────────────────────────────────────────────────────────────
// Un canal con rendition de audio real (para que el passthrough SI sea posible), un solo valor por
// parametro, ratios en 0..1 y el knob dentro de su limite.
const ok = {
  schema: 'ape-lab-metadata-v1',
  profile: 'P3',
  generated_at: '2026-11-02T00:00:00.000Z',
  fields: {
    vlcopt: { 'network-caching': 15000, 'http-max-retries': 99, 'http-timeout': 5000 },
    kodiprop: {
      'inputstream.adaptive.manifest_type': 'hls',
      'inputstream.adaptive.audio_passthrough': 'auto'
    },
    // Mismo valor que optimized_knobs. La primera version ponia 0.95 aqui y 0.9 alli, y el validador
    // la tumbo por C7: tenia razon el validador, el fixture era el que se contradecia.
    hlsjs: { abrBandWidthFactor: 0.9, abrBandWidthUpFactor: 0.7, maxBufferLength: 50 },
    settings: { resolution: '1920x1080', bufferSeconds: 200, abr_bw_factor: 0.9 },
    bounds: { buffer: [105, 315], abr_bw_factor: [0.85, 0.98] },
    optimized_knobs: { buffer_seconds: '200', abrBandWidthFactor: 0.9 },
    quality_levels: {
      L1: { resolution: '1920x1080', bitrate_mbps: 40 },
      L2: { resolution: '1280x720', bitrate_mbps: 20 }
    }
  }
};

const lineasOk = [
  ...cabecera,
  ...chunks(ok, 3),
  // Rendment de audio real: sin esto el passthrough declarado seria mentira.
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="es",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2"',
  '#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,AUDIO="audio-aac",CODECS="avc1.640028,mp4a.40.2"',
  'https://example.invalid/ok/1080p.m3u8',
  '#EXTINF:6.0,',
  'seg1.ts',
  '#EXT-X-ENDLIST',
  ''
];

// ── CONTRADICHO ─────────────────────────────────────────────────────────────────────────────
// Mismos cinco defectos que la lista real. Cero #EXT-X-MEDIA: el passthrough no puede existir.
const mal = {
  schema: 'ape-lab-metadata-v1',
  profile: 'P0',
  generated_at: '2026-11-02T00:00:00.000Z',
  fields: {
    vlcopt: { 'network-caching': 15000 },
    kodiprop: { 'inputstream.adaptive.audio_passthrough': 'auto' },
    // C1: porcentaje donde hls.js espera ratio
    hlsjs: { abrBandWidthFactor: 95, abrBandWidthUpFactor: 7 },
    // C7: el mismo parametro otra vez, con otro valor
    settings: { resolution: '7680x4320', bufferSeconds: 15 },
    bounds: { buffer: [105, 315] },
    // C5: 50 < 105
    optimized_knobs: { buffer_seconds: '50' },
    // C3: 8K sin escalador
    quality_levels: { L1: { resolution: '7680x4320', bitrate_mbps: 200 } },
    // C7 otra vez, con el nombre del objeto que si lleva el valor bueno
    player_enslavement: { level_3_per_channel: { EXTVLCOPT: { 'network-caching': 105000 } } }
  }
};

const lineasMal = [
  ...cabecera,
  ...chunks(mal, 3),
  // Sin EXT-X-MEDIA: el audio_passthrough declarado arriba no tiene a que referirse.
  '#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"',
  '#EXTVLCOPT:video-filter=zscale=w=7680:h=4320:filter=lanczos',
  'https://example.invalid/mal/2160p.m3u8',
  '#EXTINF:6.0,',
  'seg1.ts',
  '#EXT-X-ENDLIST',
  ''
];

fs.mkdirSync(dir, { recursive: true });
for (const [nombre, lineas] of [['labmeta_ok.m3u8', lineasOk], ['labmeta_mal.m3u8', lineasMal]]) {
  const destino = path.join(dir, nombre);
  fs.writeFileSync(destino, lineas.join('\n'), 'utf8');
  process.stderr.write(`  ${nombre}: ${lineas.length} lineas\n`);
}
process.stderr.write('fixtures de metadata escritos\n');
