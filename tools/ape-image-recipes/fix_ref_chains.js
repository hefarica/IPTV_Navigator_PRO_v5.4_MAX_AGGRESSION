'use strict';
// Corrige las cadenas reales de la lista: solo los parametros que ffmpeg rechaza.
// Cada cambio lleva el error medido que lo justifica (ffmpeg 8.0.1).
const fs = require('fs');

const entrada = process.argv[2] || 'tools/ape-image-recipes/ref_chains.txt';
const salida = process.argv[3] || 'tools/ape-image-recipes/ref_chains_fixed.txt';

const CAMBIOS = [
  {
    que: 'unsharp chroma_msize_x=0 -> 3',
    error: 'Value 0.000000 for parameter \'chroma_msize_x\' out of range [3 - 23]',
    afecta: 'las 3 cadenas = 10573 canales',
    aplicar: (c) => c.replace(/chroma_msize_x=0:chroma_msize_y=0/g, 'chroma_msize_x=3:chroma_msize_y=3')
  },
  {
    que: 'minterpolate scd=N (N>1) -> scd=1:scd_threshold=N',
    error: 'Value 5.000000 for parameter \'scd\' out of range [0 - 1]',
    afecta: '808 canales',
    // scd es el METODO (0-1); el umbral va en scd_threshold (0-100).
    // No se exige 'mb_size=8:' delante: atarlo a eso fue el error que dejo REF3 sin corregir, porque
    // la cadena 3 de la lista no lleva mb_size. 'scd_threshold=' no coincide porque no empieza por 'scd='.
    aplicar: (c) => c.replace(/(^|:)scd=([2-9][0-9]*)/g, (m, pre, n) => `${pre}scd=1:scd_threshold=${n}`)
  },
  {
    que: 'zscale transfer=st2084 -> smpte2084',
    error: 'Unable to parse option value "st2084"',
    afecta: '808 canales',
    aplicar: (c) => c.replace(/transfer=st2084/g, 'transfer=smpte2084')
  },
  {
    que: 'zscale matrix=2020ncl -> 2020_ncl',
    error: "Invalid chars 'cl' at the end of expression '2020ncl'",
    afecta: '808 canales (las V2 del operador ya lo escriben con guion bajo: por eso P3 si corre)',
    aplicar: (c) => c.replace(/matrix=2020ncl/g, 'matrix=2020_ncl')
  }
];

const cabecera = [
  '# Cadenas REALES de APE_LISTA_1793589060441.m3u8, CORREGIDAS.',
  '# Solo se toca lo que ffmpeg rechaza. Nada mas: ni resoluciones, ni fps, ni radios.',
  '#'
];
for (const c of CAMBIOS) {
  cabecera.push(`#   ${c.que}`);
  cabecera.push(`#     error medido: ${c.error}`);
  cabecera.push(`#     afecta: ${c.afecta}`);
}
cabecera.push('#');

const out = [...cabecera];
let n = 0;
for (const linea of fs.readFileSync(entrada, 'utf8').split('\n')) {
  if (!linea.startsWith('REF')) continue;
  const [id, origen, destino, original] = linea.split('|');
  let cadena = original;
  for (const c of CAMBIOS) cadena = c.aplicar(cadena);
  out.push(`${id}|${origen}|${destino}|${cadena}`);
  n++;
}

fs.writeFileSync(salida, out.join('\n') + '\n');
process.stdout.write(`cadenas corregidas: ${n} -> ${salida}\n`);
