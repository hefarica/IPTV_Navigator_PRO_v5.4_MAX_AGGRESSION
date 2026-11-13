#!/usr/bin/env node
/**
 * variant_select.js — pon primero la MEJOR variante real del master playlist.
 *
 * PROBLEMA QUE RESUELVE
 *   La lista declara `#EXTATTRFROMURL:quality=top,resolution=highest,bitrate=max` en el
 *   100 % de los canales, pero eso NO pide nada: es una etiqueta propietaria y RFC 8216
 *   §6.3.1 manda a los reproductores ignorar lo que no conocen. Y un master playlist
 *   desordenado hace que el ABR arranque bajo y tarde en subir.
 *
 * QUE HACE
 *   Reordena los bloques `#EXT-X-STREAM-INF` + URI para que el de mayor calidad REAL quede
 *   primero. El reproductor si consume esto, porque un master es estandar.
 *
 * QUE NO HACE (y no debe hacer nunca)
 *   - NO elimina variantes. Quitarlas rompe el fallback si la mejor falla.
 *   - NO reescribe BANDWIDTH, RESOLUTION, CODECS ni ningun atributo. Eso seria mentir.
 *   - NO toca las URLs.
 *   - Si el cuerpo no es un master limpio, lo devuelve INTACTO (passthrough). La continuidad
 *     manda: es mejor no mejorar que romper la reproduccion.
 *
 * ORDEN DE PRIORIDAD — la resolucion manda, el bitrate solo desempata
 *   Un fixture real del repo lo demuestra: `selftest_master.m3u8` declara 1080p a 5 Mbps y
 *   720p a 9 Mbps. Ordenar por bitrate pondria el 720p primero: seria DEGRADAR con la excusa
 *   de un numero mas alto. Por eso el area de pixeles es la clave primaria.
 *
 * Uso como libreria:
 *   const { reorderMaster } = require('./variant_select');
 *   const { body, report } = reorderMaster(texto);
 *
 * Uso como CLI:
 *   node variant_select.js <master.m3u8>   -> imprime el master reordenado
 *   node variant_select.js --report <f>    -> imprime solo el informe JSON
 */
'use strict';

const fs = require('fs');

/** Escalera de modernidad de codec, coherente con la doctrina del repo. */
const CODEC_RANK = [
  [/^dvh[1e]\./i, 60],        // Dolby Vision
  [/^vvc1?\./i, 55],          // VVC / H.266
  [/^hvc1\.|^hev1\./i, 50],   // HEVC (hvc1/hev1)
  [/^av01\./i, 40],           // AV1
  [/^avc1\.|^avc3\./i, 30],   // H.264
  [/^vp0?9\./i, 20],          // VP9
];

function codecRank(codecs) {
  if (!codecs) return 0;
  let best = 0;
  for (const parte of String(codecs).split(',')) {
    const c = parte.trim();
    for (const [re, rank] of CODEC_RANK) {
      if (re.test(c) && rank > best) best = rank;
    }
  }
  return best;
}

/** Extrae un atributo de la lista de atributos de un STREAM-INF. */
function attr(line, name) {
  // Atributos separados por coma, valores entre comillas o desnudos.
  const re = new RegExp(name + '=("[^"]*"|[^,]*)', 'i');
  const m = re.exec(line);
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function area(resolution) {
  if (!resolution) return 0;
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(resolution).trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * parseInt(m[2], 10);
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Puntua un bloque. Devuelve un objeto con las claves de comparacion.
 * area primero; luego codec; luego bitrate. Todo descendente.
 */
function score(streamInfLine) {
  const res = attr(streamInfLine, 'RESOLUTION');
  const codecs = attr(streamInfLine, 'CODECS');
  const bw = attr(streamInfLine, 'BANDWIDTH');
  return {
    area: area(res),
    codec: codecRank(codecs),
    bandwidth: num(bw),
    resolution: res,
    codecs: codecs,
    declaredBandwidth: bw,
  };
}

function cmpBloque(a, b) {
  if (b.score.area !== a.score.area) return b.score.area - a.score.area;
  if (b.score.codec !== a.score.codec) return b.score.codec - a.score.codec;
  if (b.score.bandwidth !== a.score.bandwidth) return b.score.bandwidth - a.score.bandwidth;
  return 0;
}

/**
 * Reordena un master playlist. NUNCA lanza: ante cualquier duda devuelve el original.
 * @param {string} body
 * @returns {{body:string, changed:boolean, reason:string, report:object}}
 */
function reorderMaster(body) {
  const passthrough = (reason, extra) => ({
    body,
    changed: false,
    reason,
    report: Object.assign({ ok: false, reason, variants: [] }, extra || {}),
  });

  if (typeof body !== 'string' || body.length === 0) return passthrough('empty_body');
  if (!/^#EXTM3U/m.test(body)) return passthrough('no_extm3u');
  if (!/#EXT-X-STREAM-INF:/m.test(body)) return passthrough('no_stream_inf');

  // Un manifiesto que mezcla STREAM-INF con segmentos EXTINF no es un master limpio.
  // No se toca: reordenarlo podria romper la reproduccion.
  if (/#EXTINF:/m.test(body)) return passthrough('mixed_master_and_media');

  // Un master solo puede tener STREAM-INF como estructura de variantes. Si hay
  // #EXT-X-I-FRAME-STREAM-INF no estorba (lleva URI= inline), pero no lo movemos.
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);

  // Localizar bloques: cada STREAM-INF + las lineas siguientes hasta el URI (la primera
  // linea no vacia y no comentario). Se preserva el texto EXACTO de cada linea.
  const bloques = [];
  const preambulo = [];
  let i = 0;

  while (i < lines.length && !lines[i].startsWith('#EXT-X-STREAM-INF:')) {
    preambulo.push(lines[i]);
    i++;
  }

  while (i < lines.length) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) {
      // material suelto entre bloques: se conserva al final para no perderlo
      bloques.push({ raw: [lines[i]], score: null, loose: true });
      i++;
      continue;
    }
    const inicio = i;
    const inf = lines[i];
    i++;
    // Buscar el URI: primera linea no vacia que no empiece por '#'
    const cuerpo = [];
    while (i < lines.length) {
      cuerpo.push(lines[i]);
      if (lines[i].trim() !== '' && !lines[i].startsWith('#')) { i++; break; }
      i++;
    }
    bloques.push({ raw: [inf, ...cuerpo], score: score(inf), loose: false });
    if (i <= inicio) i = inicio + 1;   // seguro contra bucle infinito
  }

  const reales = bloques.filter(b => !b.loose);
  if (reales.length < 2) {
    return passthrough('less_than_two_variants', {
      variants: reales.map(b => b.score),
    });
  }

  // Orden estable: Array.prototype.sort es estable en Node moderno.
  const ordenados = reales.slice().sort(cmpBloque);

  const sueltos = bloques.filter(b => b.loose).flatMap(b => b.raw);
  const salida = [...preambulo, ...ordenados.flatMap(b => b.raw)];
  // Los sueltos, si los hubiera, se respetan al final.
  const texto = (sueltos.length ? [...salida, ...sueltos] : salida).join(eol);

  // changed se decide comparando la SALIDA con la ENTRADA, no adivinando.
  const cambio = texto !== body;

  const variantes = ordenados.map(b => ({
    resolution: b.score.resolution,
    codecs: b.score.codecs,
    bandwidth: b.score.declaredBandwidth,
    area: b.score.area,
    codec_rank: b.score.codec,
  }));

  return {
    body: texto,
    changed: cambio,
    reason: cambio ? 'reordered' : 'already_ordered',
    report: {
      ok: true,
      reason: cambio ? 'reordered' : 'already_ordered',
      variants: variantes,
      best: variantes[0] || null,
      // Honestidad: el contenido no cambia, solo el orden.
      note: 'solo se reordena; ningun atributo ni URL se modifica y ninguna variante se elimina',
    },
  };
}

module.exports = { reorderMaster, score, codecRank, area };

// ---------------------------------------------------------------- CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const soloReporte = args.includes('--report');
  const fich = args.find(a => !a.startsWith('--'));
  if (!fich) {
    console.error('uso: node variant_select.js [--report] <master.m3u8>');
    process.exit(2);
  }
  const body = fs.readFileSync(fich, 'utf8');
  const r = reorderMaster(body);
  if (soloReporte) {
    console.log(JSON.stringify(r.report, null, 2));
  } else {
    process.stdout.write(r.body);
  }
  process.exit(r.changed ? 0 : 0);   // passthrough no es error
}
