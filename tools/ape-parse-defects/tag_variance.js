#!/usr/bin/env node
/**
 * tag_variance.js — separa, en toda la lista, los tags que MIDEN de los que son BOILERPLATE.
 *
 * Las rondas 29–32 encontraron el mismo patron tres veces: un tag por canal que describe una
 * propiedad del canal y que sin embargo vale lo mismo en los 10.573 canales. Eso no es un juicio
 * estetico, es medible: si un tag toma un unico valor en todos los bloques donde aparece, no puede
 * estar describiendo a cada canal por separado.
 *
 * Un tag CONSTANTE no es automaticamente un defecto: `schema: ape-lab-metadata-v1` es constante y
 * esta bien. Lo que este instrumento entrega es el CENSO, no el veredicto: la lista ordenada de
 * cuantos valores distintos toma cada tag. Quien lea decide cuales deberian variar.
 *
 * Metricas por tag:
 *   bloques_con_tag   en cuantos bloques de canal aparece
 *   valores_distintos cuantos valores unicos toma
 *   cobertura         bloques_con_tag / bloques_totales
 *
 * Clasificacion, sin juzgar:
 *   CONSTANTE   aparece en >=90 % de bloques y toma 1 solo valor
 *   VARIA       aparece en >=90 % de bloques y toma >1 valor       <- mide algo
 *   PARCIAL     aparece en <90 % de bloques                        <- opcional por canal
 *   RARO        aparece en <1 % de bloques
 *
 * Contrato de salida:
 *   0 = censo emitido (siempre, salvo error) · 5 = no se pudo leer
 *
 *   node tools/ape-parse-defects/tag_variance.js <lista.m3u8> [--json ruta] [--min-cob 0.9]
 */
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const idxJson = args.indexOf('--json');
const outJson = idxJson >= 0 ? args[idxJson + 1] : null;
const idxCob = args.indexOf('--min-cob');
const MIN_COB = idxCob >= 0 ? Number(args[idxCob + 1]) : 0.9;

if (!path) {
  process.stderr.write('uso: node tag_variance.js <lista.m3u8> [--json ruta] [--min-cob 0.9]\n');
  process.exit(3);
}

/** Nombre del tag: todo lo que va entre '#' y el ':' (o el final de linea). */
function nombreTag(linea) {
  const m = /^#([A-Za-z0-9._-]+)/.exec(linea);
  return m ? m[1] : null;
}

/** Valor del tag: lo que sigue al primer ':' que cierra el nombre. */
function valorTag(linea, nombre) {
  const pref = '#' + nombre;
  if (linea.length <= pref.length) return '';
  const resto = linea.slice(pref.length);
  return resto.startsWith(':') ? resto.slice(1).trim() : '';
}

const stats = new Map();   // nombre -> { bloques, valores:Set, ejemplos:[] }
/**
 * Tags que caen FUERA de cualquier bloque de canal: cabecera, y todo lo anterior al primer #EXTINF.
 * Se cuentan aparte porque `#EXTM3U`, `#EXT-X-VERSION`, `#EXT-X-KEY` y `#EXT-X-TARGETDURATION` viven
 * ahi. Antes se perdian y el censo los reportaba AUSENTE — que se lee como cero y no lo es.
 */
const fuera = new Map();
let bloques = 0;
let enBloque = false;

function tocar(nombre, valor) {
  let s = stats.get(nombre);
  if (!s) {
    s = { bloques: 0, valores: new Map() };
    stats.set(nombre, s);
  }
  s.bloques++;
  s.valores.set(valor, (s.valores.get(valor) || 0) + 1);
}

function tocarFuera(nombre, valor) {
  let s = fuera.get(nombre);
  if (!s) {
    s = { n: 0, valores: new Map() };
    fuera.set(nombre, s);
  }
  s.n++;
  s.valores.set(valor, (s.valores.get(valor) || 0) + 1);
}

function procesar(linea) {
  if (linea.startsWith('#EXTINF')) {
    bloques++;
    enBloque = true;
    return;
  }
  if (!linea.startsWith('#')) return;

  const nombre = nombreTag(linea);
  if (!nombre) return;

  // El tag de metadata chunked lleva el indice dentro del valor (1/20:...), asi que cada
  // chunk seria "distinto" por construccion. Se agrupa por el tag sin indice.
  const valor = nombre === 'EXT-X-APE-LAB-METADATA' ? '<chunked>' : valorTag(linea, nombre);

  if (!enBloque) {
    tocarFuera(nombre, valor);
    return;
  }
  tocar(nombre, valor);
}

function finalizar() {
  const filas = [];
  for (const [nombre, s] of stats) {
    // Un tag puede aparecer varias veces por bloque (p.ej. EXTVLCOPT); la cobertura se mide
    // en bloques unicos, no en ocurrencias, asi que se acota a bloques.
    const cob = bloques ? Math.min(1, s.bloques / bloques) : 0;
    const distintos = s.valores.size;
    let clase;
    if (cob >= MIN_COB) clase = distintos === 1 ? 'CONSTANTE' : 'VARIA';
    else if (cob < 0.01) clase = 'RARO';
    else clase = 'PARCIAL';

    const top = [...s.valores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    filas.push({
      tag: nombre,
      bloques_con_tag: s.bloques,
      cobertura: Number(cob.toFixed(4)),
      valores_distintos: distintos,
      clase,
      top_valores: top.map(([v, c]) => ({ valor: v.length > 90 ? v.slice(0, 90) + '…' : v, n: c }))
    });
  }

  filas.sort((a, b) => {
    // CONSTANTE primero (lo que hay que revisar), luego por cobertura desc.
    const orden = { CONSTANTE: 0, VARIA: 1, PARCIAL: 2, RARO: 3 };
    if (orden[a.clase] !== orden[b.clase]) return orden[a.clase] - orden[b.clase];
    return b.cobertura - a.cobertura;
  });

  const resumen = {
    bloques,
    tags_distintos: filas.length,
    CONSTANTE: filas.filter((f) => f.clase === 'CONSTANTE').length,
    VARIA: filas.filter((f) => f.clase === 'VARIA').length,
    PARCIAL: filas.filter((f) => f.clase === 'PARCIAL').length,
    RARO: filas.filter((f) => f.clase === 'RARO').length
  };

  const fueraDeBloque = {};
  for (const [nombre, s] of fuera) {
    fueraDeBloque[nombre] = {
      ocurrencias: s.n,
      valores_distintos: s.valores.size,
      valores: [...s.valores.entries()].slice(0, 3).map(([v, c]) => ({
        valor: v.length > 90 ? v.slice(0, 90) + '…' : v,
        n: c
      }))
    };
  }

  const informe = {
    archivo: path,
    min_cobertura: MIN_COB,
    resumen,
    constante: filas.filter((f) => f.clase === 'CONSTANTE'),
    varia: filas.filter((f) => f.clase === 'VARIA'),
    parcial: filas.filter((f) => f.clase === 'PARCIAL'),
    raro: filas.filter((f) => f.clase === 'RARO'),
    // Tags fuera de bloque: cabecera. Se listan aparte y NUNCA se suman a las clases de
    // arriba: un tag de cabecera no describe un canal, y contarlo como constante seria
    // volver a leer "no computado" como "cero".
    fuera_de_bloque: fueraDeBloque
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');

  process.stderr.write(
    `\n${bloques} bloques · ${filas.length} tags en bloque · ${Object.keys(fueraDeBloque).length} tags fuera de bloque\n` +
    `  CONSTANTE ${resumen.CONSTANTE} · VARIA ${resumen.VARIA} · ` +
    `PARCIAL ${resumen.PARCIAL} · RARO ${resumen.RARO}\n`
  );
  process.exit(0); // exit-ok: censo emitido según contrato; CONSTANTE es una clasificación, no un fallo del comando.
}

const rs = fs.createReadStream(path, { highWaterMark: 1 << 20 });
let resto = '';
rs.on('data', (d) => {
  const trozos = (resto + d.toString('utf8')).split('\n');
  resto = trozos.pop();
  for (const l of trozos) procesar(l);
});
rs.on('end', () => {
  if (resto) procesar(resto);
  finalizar();
});
rs.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  process.exit(5);
});
