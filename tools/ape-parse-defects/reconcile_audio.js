#!/usr/bin/env node
/**
 * reconcile_audio.js — aplica las TRES correcciones del plano de audio justificadas por evidencia,
 * sin elegir "que capa manda".
 *
 * Por que no elige capa: la Opcion A (KODIPROP manda) quedó descartada porque 15 de las 15 claves
 * `inputstream.adaptive.audio_*` no son propiedades que ese add-on lea (ver
 * `kodiprop_key_audit.js` y `17_AUDIO_LAYER_VERDICT.md`). Elevar una capa que el motor descarta no
 * reconcilia nada. Las tres correcciones de abajo no dependen de esa decisión:
 *
 *   R1  #EXT-X-APE-AUDIO-PASSTHROUGH:ENABLED=true  ->  ENABLED=false
 *       Solo si la lista NO declara #EXT-X-MEDIA. Sin rendition no hay pista que reenviar: no es una
 *       preferencia de capa, es un hecho del manifiesto.
 *
 *   R2  #KODIPROP:inputstream.adaptive.audio_*  ->  se elimina
 *       Las 15 son inventadas; el add-on hace getProperty por nombre y las ignora. Borrarlas no
 *       cambia comportamiento y quita una afirmación falsa. No es "que gane otra capa": es que esta
 *       no existe.
 *
 *   R3  #EXTVLCOPT:audio-channels=N  ->  se elimina
 *       Es una opción REAL de VLC (entre las 58 presentes del VLC_OPT_AUDIT.md) y por eso es la
 *       única del plano que sí hace algo: fuerza N canales de salida. Sobre una fuente estéreo eso es
 *       upmix, no passthrough. Se quita salvo que el operador verifique 6 canales en origen.
 *
 * Transformacion a nivel de LINEA, no de bloque: se preserva todo lo que no se toca, incluidos los
 * tails de bloque y el orden. Cualquier reconstruccion por bloques perderia lineas desconocidas.
 *
 * Uso:
 *   node tools/ape-parse-defects/reconcile_audio.js <entrada.m3u8> <salida.m3u8> [--json ruta]
 *
 * Contrato: 0 = transformacion escrita · 5 = no se pudo leer/escribir · 3 = uso incorrecto
 */
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const posicionales = args.filter((a) => !a.startsWith('--'));
const idxJson = args.indexOf('--json');
const outJson = idxJson >= 0 ? args[idxJson + 1] : null;

if (posicionales.length < 2) {
  process.stderr.write('uso: node reconcile_audio.js <entrada.m3u8> <salida.m3u8> [--json ruta]\n');
  process.exit(3);
}
const [entrada, salida] = posicionales;

/** Las 15 claves de audio que NO son propiedades de inputstream.adaptive. */
const KODIPROP_AUDIO_INVENTADAS = [
  'inputstream.adaptive.audio_language_preference',
  'inputstream.adaptive.audio_channels',
  'inputstream.adaptive.audio_dolby_atmos',
  'inputstream.adaptive.audio_dts',
  'inputstream.adaptive.audio_truehd',
  'inputstream.adaptive.audio_eac3',
  'inputstream.adaptive.audio_ac3',
  'inputstream.adaptive.audio_aac',
  'inputstream.adaptive.audio_mp3',
  'inputstream.adaptive.audio_passthrough',
  'inputstream.adaptive.audio_samplerate',
  'inputstream.adaptive.audio_bitdepth',
  'inputstream.adaptive.audio_passthrough_earc',
  'inputstream.adaptive.audio_codec_priority',
  'inputstream.adaptive.audio_fallback'
];
const SET_INVENTADAS = new Set(KODIPROP_AUDIO_INVENTADAS);

/**
 * Decide si R1 aplica. Se recorre el fichero contando #EXT-X-MEDIA: si hay alguno, la lista SI tiene
 * renditions y el passthrough puede ser cierto, asi que no se toca. Fail-safe: ante la duda, no tocar.
 */
function contarMedia() {
  return new Promise((res, rej) => {
    const rs = fs.createReadStream(entrada, { highWaterMark: 1 << 20 });
    let resto = '';
    let n = 0;
    rs.on('data', (d) => {
      const trozos = (resto + d.toString('utf8')).split('\n');
      resto = trozos.pop();
      for (const l of trozos) if (l.startsWith('#EXT-X-MEDIA')) n++;
    });
    rs.on('end', () => {
      if (resto.startsWith('#EXT-X-MEDIA')) n++;
      res(n);
    });
    rs.on('error', rej);
  });
}

(async () => {
  let mediaDeclarados;
  try {
    mediaDeclarados = await contarMedia();
  } catch (e) {
    process.stderr.write('ERROR leyendo entrada: ' + e.message + '\n');
    process.exit(5);
  }

  const r1Aplica = mediaDeclarados === 0;

  const cuenta = {
    R1_passthrough_corregido: 0,
    R2_kodiprop_audio_borradas: 0,
    R3_extvlcopt_audio_channels_borradas: 0,
    lineas_entrada: 0,
    lineas_salida: 0
  };

  const ws = fs.createWriteStream(salida, { encoding: 'utf8' });
  const rs = fs.createReadStream(entrada, { highWaterMark: 1 << 20 });

  let resto = '';
  let cerrado = false;

  const escribir = (s) => {
    if (!ws.write(s)) {
      rs.pause();
      ws.once('drain', () => rs.resume());
    }
  };

  const procesar = (linea, esUltima) => {
    cuenta.lineas_entrada++;

    // R1
    if (r1Aplica && /^#EXT-X-APE-AUDIO-PASSTHROUGH:ENABLED=true\s*$/i.test(linea)) {
      cuenta.R1_passthrough_corregido++;
      cuenta.lineas_salida++;
      escribir('#EXT-X-APE-AUDIO-PASSTHROUGH:ENABLED=false' + (esUltima ? '' : '\n'));
      return;
    }

    // R2
    const mK = /^#KODIPROP:([^=\s]+)/.exec(linea);
    if (mK && SET_INVENTADAS.has(mK[1])) {
      cuenta.R2_kodiprop_audio_borradas++;
      return;   // se omite la linea entera
    }

    // R3
    if (/^#EXTVLCOPT:audio-channels=/i.test(linea)) {
      cuenta.R3_extvlcopt_audio_channels_borradas++;
      return;
    }

    cuenta.lineas_salida++;
    escribir(linea + (esUltima ? '' : '\n'));
  };

  rs.on('data', (d) => {
    const trozos = (resto + d.toString('utf8')).split('\n');
    resto = trozos.pop();
    for (const l of trozos) procesar(l, false);
  });

  rs.on('end', () => {
    if (resto !== '') procesar(resto, true);
    ws.end();
  });

  rs.on('error', (e) => {
    process.stderr.write('ERROR leyendo: ' + e.message + '\n');
    ws.end();
    process.exit(5);
  });

  ws.on('finish', () => {
    if (cerrado) return;
    cerrado = true;
    const informe = {
      entrada,
      salida,
      ext_x_media_declarados: mediaDeclarados,
      R1_aplicada: r1Aplica,
      R1_motivo: r1Aplica
        ? 'la lista no declara #EXT-X-MEDIA: no hay pista que reenviar'
        : 'la lista SI declara #EXT-X-MEDIA: no se toca el passthrough',
      cuentas: cuenta
    };
    process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
    if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');
    process.stderr.write(
      `\nR1 passthrough corregido: ${cuenta.R1_passthrough_corregido}` +
      ` · R2 kodiprop inventadas borradas: ${cuenta.R2_kodiprop_audio_borradas}` +
      ` · R3 audio-channels borradas: ${cuenta.R3_extvlcopt_audio_channels_borradas}\n` +
      `lineas ${cuenta.lineas_entrada} -> ${cuenta.lineas_salida}\n`
    );
    process.exit(0); // exit-ok: transformación escrita; este comando no certifica la calidad de reproducción.
  });

  ws.on('error', (e) => {
    process.stderr.write('ERROR escribiendo: ' + e.message + '\n');
    process.exit(5);
  });
})();
