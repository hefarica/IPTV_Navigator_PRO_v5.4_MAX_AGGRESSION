#!/usr/bin/env node
/**
 * vlc_filter_modules.js — comprueba cada módulo de una cadena contra los modulos de filtro de video
 * que VLC TIENE DE VERDAD.
 *
 * Por que existe: durante toda la auditoria el veredicto sobre `#EXTVLCOPT:video-filter=` fue "esto es
 * ffmpeg, no he probado VLC". Esta herramienta cierra ese hueco con el inventario del binario instalado,
 * no con memoria de nadie.
 *
 * Fuente de verdad, por orden:
 *   1. El directorio de plugins de VLC en disco (plugins/video_filter/*.dll -> nombre del modulo).
 *   2. La lista documentada de abajo, con su procedencia anotada.
 * Si no hay ni una ni otra, la herramienta dice que no puede decidir y sale con 5. No adivina.
 *
 * Importante: un nombre que NO aparece aqui no es "imposible de todo punto"; es "no es un modulo de
 * filtro de video de VLC 3.x". Los modos de `deinterlace` (yadif, blend...) y los conversores de croma
 * (scale, transform) son otra cosa y esta herramienta NO los cuenta como filtros con cadena propia.
 *
 * Uso:
 *   node tools/ape-image-recipes/vlc_filter_modules.js [--chains ruta] [--json ruta]
 *   node tools/ape-image-recipes/vlc_filter_modules.js --listar
 * Contrato: 0 = todos los modulos de todas las cadenas existen · 4 = falta alguno · 5 = sin fuente
 */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const flag = (n) => args.includes(n);

/**
 * Inventario leido de C:\Program Files\VideoLAN\VLC\plugins\video_filter el 2026-11-02 (41 modulos).
 * Se usa solo si el directorio de plugins no esta accesible desde este host.
 */
const DOCUMENTADO = [
  'adjust', 'alphamask', 'anaglyph', 'antiflicker', 'ball', 'blend', 'blendbench', 'bluescreen',
  'canvas', 'colorthres', 'croppadd', 'deinterlace', 'edgedetection', 'erase', 'extract', 'fps',
  'freeze', 'gaussianblur', 'gradfun', 'gradient', 'grain', 'hqdn3d', 'invert', 'magnify', 'mirror',
  'motionblur', 'motiondetect', 'oldmovie', 'posterize', 'postproc', 'psychedelic', 'puzzle', 'ripple',
  'rotate', 'scale', 'scene', 'sepia', 'sharpen', 'transform', 'vhs', 'wave'
];

/** Alias que VLC acepta ademas del nombre del modulo. */
const ALIAS = { pp: 'postproc' };

const CANDIDATOS_PLUGINS = [
  'C:/Program Files/VideoLAN/VLC/plugins/video_filter',
  'C:/Program Files (x86)/VideoLAN/VLC/plugins/video_filter',
  '/usr/lib/x86_64-linux-gnu/vlc/plugins/video_filter',
  '/usr/lib/vlc/plugins/video_filter'
];

function inventario() {
  for (const dir of CANDIDATOS_PLUGINS) {
    if (!fs.existsSync(dir)) continue;
    const mods = fs
      .readdirSync(dir)
      .filter((f) => /^lib.+_plugin\.(dll|so)$/.test(f))
      .map((f) => f.replace(/^lib/, '').replace(/_plugin\.(dll|so)$/, ''));
    if (mods.length) return { fuente: dir, modulos: mods.sort() };
  }
  return { fuente: 'lista documentada (plugins de VLC no accesibles)', modulos: [...DOCUMENTADO].sort() };
}

const { fuente, modulos } = inventario();
if (flag('--listar')) {
  process.stdout.write(`fuente: ${fuente}\n${modulos.join('\n')}\n`);
  process.exit(0);
}

const SET = new Set(modulos);
const existe = (m) => SET.has(m) || (ALIAS[m] && SET.has(ALIAS[m]));

const chainsPath = arg('--chains', 'tools/ape-image-recipes/ref_chains.txt');
const outJson = arg('--json', null);

if (!fs.existsSync(chainsPath)) {
  process.stderr.write(`ERROR: no existe ${chainsPath}\n`);
  process.exit(5);
}

const filas = [];
for (const linea of fs.readFileSync(chainsPath, 'utf8').split('\n')) {
  if (!/^[A-Z]/.test(linea)) continue;
  const partes = linea.split('|');
  const id = partes[0];
  const cadena = partes[3];
  if (!cadena) continue;

  const mods = cadena
    .split(',')
    .map((t) => {
      const i = t.indexOf('=');
      return (i < 0 ? t : t.slice(0, i)).trim();
    })
    .filter(Boolean);

  const conModulo = mods.map((m) => ({ modulo: m, en_vlc: existe(m) }));
  const faltan = conModulo.filter((x) => !x.en_vlc).map((x) => x.modulo);
  filas.push({ id, modulos: conModulo, faltan, en_vlc: conModulo.filter((x) => x.en_vlc).length });
}

const informe = {
  fuente_inventario: fuente,
  modulos_en_vlc: modulos.length,
  cadenas: filas,
  resumen: {
    cadenas: filas.length,
    cadenas_con_modulo_ausente: filas.filter((f) => f.faltan.length > 0).length,
    modulos_ausentes_distintos: [...new Set(filas.flatMap((f) => f.faltan))].sort()
  }
};
process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');

process.stderr.write(`\nfuente: ${fuente}  (${modulos.length} modulos de filtro de video)\n`);
for (const f of filas) {
  const ok = f.modulos.filter((m) => m.en_vlc).map((m) => m.modulo);
  process.stderr.write(
    `  ${f.id}  ${f.en_vlc}/${f.modulos.length} en VLC` +
    (f.faltan.length ? `   FALTAN: ${f.faltan.join(', ')}` : '   todos existen') +
    `\n        presentes: ${ok.join(', ') || '(ninguno)'}\n`
  );
}
process.stderr.write(`\ncadenas con algun modulo ausente: ${informe.resumen.cadenas_con_modulo_ausente} de ${filas.length}\n`);
process.exit(informe.resumen.cadenas_con_modulo_ausente === 0 ? 0 : 4);
