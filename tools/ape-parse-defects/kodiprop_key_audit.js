#!/usr/bin/env node
/**
 * kodiprop_key_audit.js — valida cada clave `#KODIPROP:inputstream.adaptive.*` contra la lista
 * OFICIAL de propiedades que ese add-on lee de verdad.
 *
 * Por que existe: la lista de referencia emite 98 claves `inputstream.adaptive.*`. Decidir "que capa
 * manda" sobre el audio exige primero saber que capa es LEIDA. Un add-on ignora en silencio las
 * propiedades que no conoce, asi que una clave inventada no falla: simplemente no hace nada, y parece
 * que funciona.
 *
 * Fuente de la lista de propiedades (consultada 2026-11-02):
 *   https://github.com/xbmc/inputstream.adaptive/wiki/Integration
 * Se separan las que la wiki declara deprecadas o eliminadas en alguna version, porque "existe" y
 * "sigue vigente" no son lo mismo.
 *
 * La pagina "Stream-selection-types-properties" del mismo wiki NO la he leido, asi que las claves
 * `chooser_*` se marcan como NO_VERIFICADA en vez de inventadas: no encontrado no es inexistente.
 *
 * Contrato: 0 = todas las claves son reales y vigentes · 4 = hay inventadas o deprecadas · 5 = no leible
 *
 *   node tools/ape-parse-defects/kodiprop_key_audit.js <lista.m3u8> [--json ruta]
 */
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const idxJson = args.indexOf('--json');
const outJson = idxJson >= 0 ? args[idxJson + 1] : null;

if (!path) {
  process.stderr.write('uso: node kodiprop_key_audit.js <lista.m3u8> [--json ruta]\n');
  process.exit(3);
}

/** Propiedades vigentes segun la wiki Integration. */
const REALES_VIGENTES = new Set([
  'inputstream.adaptive.common_headers',
  'inputstream.adaptive.manifest_params',
  'inputstream.adaptive.manifest_headers',
  'inputstream.adaptive.manifest_upd_params',
  'inputstream.adaptive.stream_params',
  'inputstream.adaptive.stream_headers',
  'inputstream.adaptive.manifest_config',
  'inputstream.adaptive.play_timeshift_buffer',
  'inputstream.adaptive.stream_selection_type',
  'inputstream.adaptive.config'
]);

/** Existen en la wiki pero marcadas deprecated/removed: funcionan segun version de Kodi. */
const REALES_DEPRECADAS = new Map([
  ['inputstream.adaptive.manifest_type', 'deprecada en Kodi 21, eliminada en Kodi 22'],
  ['inputstream.adaptive.manifest_update_parameter', 'deprecada en Kodi 21, eliminada en Kodi 22'],
  ['inputstream.adaptive.max_bandwidth', 'deprecada en Kodi 20, eliminada en Kodi 21'],
  ['inputstream.adaptive.live_delay', 'deprecada en Kodi 22'],
  ['inputstream.adaptive.original_audio_language', 'deprecada en Kodi 22']
]);

/** Familias que la wiki cubre en OTRA pagina que no he leido: no se declaran inventadas. */
const NO_VERIFICADAS = /^inputstream\.adaptive\.chooser_[a-z_]+$/;

const claves = new Map();   // clave -> ocurrencias

function procesar(linea) {
  if (!linea.startsWith('#KODIPROP:')) return;
  const m = /^#KODIPROP:(inputstream\.adaptive\.[^=]+)/.exec(linea);
  if (!m) return;
  const k = m[1].trim();
  claves.set(k, (claves.get(k) || 0) + 1);
}

function clasificar(k) {
  if (REALES_VIGENTES.has(k)) return { clase: 'REAL_VIGENTE' };
  if (REALES_DEPRECADAS.has(k)) return { clase: 'REAL_DEPRECADA', nota: REALES_DEPRECADAS.get(k) };
  if (NO_VERIFICADAS.test(k)) return { clase: 'NO_VERIFICADA', nota: 'familia chooser_*, cubierta en una pagina del wiki no consultada' };
  return { clase: 'INVENTADA' };
}

function finalizar() {
  const filas = [...claves.entries()]
    .map(([clave, n]) => ({ clave, ocurrencias: n, ...clasificar(clave) }))
    .sort((a, b) => {
      const orden = { INVENTADA: 0, REAL_DEPRECADA: 1, NO_VERIFICADA: 2, REAL_VIGENTE: 3 };
      if (orden[a.clase] !== orden[b.clase]) return orden[a.clase] - orden[b.clase];
      return b.ocurrencias - a.ocurrencias;
    });

  const porClase = (c) => filas.filter((f) => f.clase === c);
  const inventadas = porClase('INVENTADA');
  const deprecadas = porClase('REAL_DEPRECADA');
  const noVerif = porClase('NO_VERIFICADA');
  const vigentes = porClase('REAL_VIGENTE');

  // Las que el operador preguntaba por el plano de audio, senaladas explicitamente.
  const CODECS_AUDIO = /\.(audio_[a-z_]+)$/;
  const audioInventadas = inventadas.filter((f) => /\.audio_/.test(f.clave));

  const informe = {
    archivo: path,
    fuente_propiedades: 'https://github.com/xbmc/inputstream.adaptive/wiki/Integration (2026-11-02)',
    resumen: {
      claves_distintas: filas.length,
      REAL_VIGENTE: vigentes.length,
      REAL_DEPRECADA: deprecadas.length,
      NO_VERIFICADA: noVerif.length,
      INVENTADA: inventadas.length,
      porcentaje_inventadas: filas.length ? Number(((inventadas.length / filas.length) * 100).toFixed(1)) : 0,
      de_esas_claves_son_de_audio: audioInventadas.length
    },
    inventadas,
    deprecadas,
    no_verificadas: noVerif,
    vigentes
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');

  process.stderr.write(
    `\n${filas.length} claves inputstream.adaptive.* distintas\n` +
    `  REAL_VIGENTE ${vigentes.length} · REAL_DEPRECADA ${deprecadas.length} · ` +
    `NO_VERIFICADA ${noVerif.length} · INVENTADA ${inventadas.length} (${informe.resumen.porcentaje_inventadas}%)\n`
  );
  if (audioInventadas.length) {
    process.stderr.write(`  de las inventadas, ${audioInventadas.length} son del plano de audio:\n`);
    for (const f of audioInventadas) process.stderr.write(`    ${f.clave}\n`);
  }
  // Deprecada tambien es un problema, pero distinto de inventada: no lo mezclo en el exit code.
  process.exit(inventadas.length === 0 && deprecadas.length === 0 ? 0 : 4);
}

const rs = fs.createReadStream(path, { highWaterMark: 1 << 20 });
let resto = '';
let bloques = 0;
rs.on('data', (d) => {
  const trozos = (resto + d.toString('utf8')).split('\n');
  resto = trozos.pop();
  for (const l of trozos) {
    procesar(l);
    // La cabecera ya trae las 98; seguir hasta 50 bloques por si un fichero las repite por canal.
    if (l.startsWith('#EXTINF') && ++bloques > 50) { rs.destroy(); return; }
  }
});
rs.on('close', finalizar);
rs.on('end', finalizar);
rs.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  process.exit(5);
});
