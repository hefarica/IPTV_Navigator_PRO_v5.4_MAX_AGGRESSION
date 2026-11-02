#!/usr/bin/env node
/**
 * audio_contradictions.js — detecta el plano de audio contradictorio de una lista.
 *
 * Hallazgo de la ronda 29: un mismo bloque de canal declara la misma propiedad de audio
 * con valores opuestos en capas distintas, y declara passthrough donde no puede existir.
 * Esto lo convierte en una comprobacion repetible en vez de una lectura manual.
 *
 * Que detecta, por bloque de canal:
 *   C1  misma propiedad booleana con valor opuesto entre `#KODIPROP` y `#EXT-X-APE-AUDIO-*`
 *       (dolby_atmos / dts / truehd / eac3)
 *   C2  mas de un ancho de canal distinto declarado para el mismo canal
 *       (`EXTVLCOPT:audio-channels` / `KODIPROP:...audio_channels` / `APE-AUDIO:...CHANNELS`)
 *   C3  campo de codec de audio vacio (`APE-AUDIO:CODEC=`, `TELCHEMY-CODEC:...AUDIO=`)
 *   C4  `APE-AUDIO-PASSTHROUGH:ENABLED=true` en una lista sin `#EXT-X-MEDIA`
 *
 * C4 es la que importa de verdad: sin rendition no hay pista que reenviar, asi que la
 * declaracion no se puede cumplir por mucha configuracion que se toque.
 *
 * Contrato de salida, el mismo que el resto de tools/:
 *   0 = sin contradicciones · 4 = contradicciones encontradas · 5 = no se pudo leer
 *
 *   node tools/ape-parse-defects/audio_contradictions.js <lista.m3u8> [--json ruta]
 */
'use strict';

const fs = require('fs');

const path = process.argv[2];
const argJson = process.argv.indexOf('--json');
if (!path || path.startsWith('--')) {
  process.stderr.write('uso: node audio_contradictions.js <lista.m3u8> [--json ruta]\n');
  process.exit(3);
}

/** Extrae el valor booleano de `...ENABLED=true|false` o `...=true|false`. */
function boolDe(linea, clave) {
  const re = new RegExp(clave + '(?:=|:)\\s*(true|false)', 'i');
  const m = re.exec(linea);
  return m ? m[1].toLowerCase() === 'true' : null;
}

/** Normaliza un ancho de canal a un token comparable. */
function anchoDe(v) {
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s + '.0';
  return s;
}

const bloques = [];
let bloque = null;
let mediaTotal = 0;

function nuevoBloque() {
  return {
    lineaInicio: 0,
    // C1: pares (capa -> booleano)
    kodiprop: {},
    ape: {},
    // C2
    anchos: [],
    // C3
    codecVacio: [],
    // C4
    passthrough: null
  };
}

function cerrar() {
  if (bloque) bloques.push(bloque);
  bloque = null;
}

/**
 * Procesa una linea. Se llama desde el stream, no desde un array en memoria: la lista
 * de referencia son 604.593.696 B y leerla entera como string revienta el limite de V8
 * (`Cannot create a string longer than 0x1fffffe8`). Solo se guarda el estado del bloque
 * en curso, que esta acotado.
 */
function procesar(linea) {
  if (linea.startsWith('#EXTINF')) {
    cerrar();
    bloque = nuevoBloque();
    return;
  }
  if (!bloque) return;

  // C4 se evalua despues; aqui solo se cuenta el tag en toda la lista.
  if (/^#EXT-X-MEDIA(\b|:)/.test(linea)) mediaTotal++;

  if (linea.startsWith('#KODIPROP:')) {
    if (/audio_dolby_atmos=/i.test(linea)) bloque.kodiprop.atmos = boolDe(linea, 'audio_dolby_atmos');
    if (/audio_dts=/i.test(linea)) bloque.kodiprop.dts = boolDe(linea, 'audio_dts');
    if (/audio_truehd=/i.test(linea)) bloque.kodiprop.truehd = boolDe(linea, 'audio_truehd');
    if (/audio_eac3=/i.test(linea)) bloque.kodiprop.eac3 = boolDe(linea, 'audio_eac3');
    const m = /audio_channels=([^;\s]+)/i.exec(linea);
    if (m) bloque.anchos.push({ capa: 'KODIPROP', valor: anchoDe(m[1]) });
  } else if (linea.startsWith('#EXTVLCOPT:')) {
    const m = /audio-channels=([^;\s:]+)/i.exec(linea);
    if (m) bloque.anchos.push({ capa: 'EXTVLCOPT', valor: anchoDe(m[1]) });
  } else if (linea.startsWith('#EXT-X-APE-AUDIO-ATMOS')) {
    bloque.ape.atmos = boolDe(linea, 'ENABLED');
  } else if (linea.startsWith('#EXT-X-APE-AUDIO-DTS-X')) {
    bloque.ape.dts = boolDe(linea, 'ENABLED');
  } else if (linea.startsWith('#EXT-X-APE-AUDIO-TRUEHD')) {
    bloque.ape.truehd = boolDe(linea, 'ENABLED');
  } else if (linea.startsWith('#EXT-X-APE-AUDIO-EAC3')) {
    bloque.ape.eac3 = boolDe(linea, 'ENABLED');
  } else if (linea.startsWith('#EXT-X-APE-AUDIO-PASSTHROUGH')) {
    bloque.passthrough = boolDe(linea, 'ENABLED');
  } else if (linea.startsWith('#EXT-X-APE-AUDIO:') || linea.startsWith('#EXT-X-APE-AUDIO-BITRATE')) {
    const m = /CHANNELS=([^,;\s]+)/i.exec(linea);
    if (m) bloque.anchos.push({ capa: 'APE', valor: anchoDe(m[1]) });
    if (/CODEC=(\s*,|\s*$)/i.test(linea)) bloque.codecVacio.push('APE-AUDIO:CODEC=');
  } else if (linea.startsWith('#EXT-X-APE-TELCHEMY-CODEC')) {
    if (/AUDIO=(\s*$|\s*,)/i.test(linea)) bloque.codecVacio.push('TELCHEMY:AUDIO=');
  } else if (linea.startsWith('#EXTHTTP:')) {
    if (/"X-APE-Codec-Audio"\s*:\s*""/.test(linea)) bloque.codecVacio.push('EXTHTTP:X-APE-Codec-Audio');
  }
}

function finalizar() {
  cerrar();

  // ---- evaluacion -----------------------------------------------------------
  const props = ['atmos', 'dts', 'truehd', 'eac3'];
  const res = { C1: [], C2: [], C3: [], C4: [] };

  bloques.forEach((b, idx) => {
    for (const p of props) {
      const k = b.kodiprop[p];
      const a = b.ape[p];
      if (k !== null && k !== undefined && a !== null && a !== undefined && k !== a) {
        res.C1.push({ bloque: idx + 1, propiedad: p, kodiprop: k, ape: a });
      }
    }

    const distintos = [...new Set(b.anchos.map(x => x.valor))];
    if (distintos.length > 1) {
      res.C2.push({ bloque: idx + 1, valores: b.anchos });
    }

    if (b.codecVacio.length) {
      res.C3.push({ bloque: idx + 1, campos: [...new Set(b.codecVacio)] });
    }

    if (b.passthrough === true && mediaTotal === 0) {
      res.C4.push({ bloque: idx + 1 });
    }
  });

  const total = res.C1.length + res.C2.length + res.C3.length + res.C4.length;

  const informe = {
    archivo: path,
    bloques: bloques.length,
    ext_x_media: mediaTotal,
    resumen: {
      C1_booleano_opuesto: res.C1.length,
      C2_anchos_inconsistentes: res.C2.length,
      C3_codec_vacio: res.C3.length,
      C4_passthrough_imposible: res.C4.length,
      total
    },
    muestras: {
      C1: res.C1.slice(0, 5),
      C2: res.C2.slice(0, 3),
      C3: res.C3.slice(0, 3),
      C4: res.C4.slice(0, 3)
    },
    nota: mediaTotal === 0
      ? 'la lista no declara #EXT-X-MEDIA: no hay rendition de audio, luego C4 es imposible de cumplir'
      : 'la lista declara #EXT-X-MEDIA: C4 no aplica como imposibilidad'
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (argJson > 0 && process.argv[argJson + 1]) {
    fs.writeFileSync(process.argv[argJson + 1], JSON.stringify(informe, null, 2) + '\n');
  }
  process.exit(total === 0 ? 0 : 4);
}

// ---- lectura en streaming ---------------------------------------------------
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
