/**
 * APE Header Validator E2E — Módulo 2: Parser M3U8
 * =================================================
 * Lee una lista .m3u8 generada por m3u8-typed-arrays-ultimate.js,
 * extrae los canales de prueba y parsea sus bloques #EXTHTTP y #KODIPROP
 * para obtener los headers DECLARADOS por el generador.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Parsea un archivo M3U8 y extrae los canales con sus headers declarados.
 * @param {string} m3u8Path - Ruta al archivo .m3u8
 * @param {object} options  - { maxChannels: 20, tierFilter: null }
 * @returns {Array<ChannelEntry>}
 */
function parseM3U8(m3u8Path, options = {}) {
  const { maxChannels = 20, tierFilter = null } = options;

  if (!fs.existsSync(m3u8Path)) {
    throw new Error(`Archivo M3U8 no encontrado: ${m3u8Path}`);
  }

  // Extraer las primeras N líneas suficientes para sacar maxChannels
  // Usaremos execSync para usar 'head' en Linux
  const { execSync } = require('child_process');
  // Estimamos 500 líneas por canal
  const linesToRead = maxChannels * 500;
  const content = execSync(`head -n ${linesToRead} "${m3u8Path}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

  const blocks = content.split('#EXTINF');
  const channels = [];

  for (let i = 1; i < blocks.length && channels.length < maxChannels; i++) {
    const block = '#EXTINF' + blocks[i];
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    const line = lines[0];

    // Extraer metadatos del canal desde #EXTINF
    const channel = {
      index        : channels.length,
      extinf       : line,
      name         : _extractAttr(line, 'tvg-name') || `Canal-${channels.length}`,
      tier         : _extractAttr(line, 'ape-tier') || 'UNKNOWN',
      exthttp      : null,   // headers declarados en #EXTHTTP (JSON parseado)
      kodiprop     : {},     // headers de #KODIPROP
      url          : null,
      exthttpRaw   : null,
      exthttpBytes : 0
    };

    // Si se especificó filtro de tier, saltar canales que no coincidan
    if (tierFilter && channel.tier !== tierFilter) { continue; }

    let extHttpAcc = '';
    let inExtHttp = false;

    for (let j = 1; j < lines.length; j++) {
      const l = lines[j];

      if (inExtHttp) {
        if (l.startsWith('#') || l.startsWith('http')) {
          inExtHttp = false;
          channel.exthttpRaw = extHttpAcc.trim();
          try {
            channel.exthttp = JSON.parse(decodeURIComponent(channel.exthttpRaw));
            channel.exthttpBytes = channel.exthttpRaw.length;
          } catch (e) {
            try { channel.exthttp = JSON.parse(channel.exthttpRaw); channel.exthttpBytes = channel.exthttpRaw.length; } catch (e2) { channel.exthttp = { _parseError: e2.message }; }
          }
          j--; // Reprocesar esta línea
          continue;
        } else {
          extHttpAcc += l;
          continue;
        }
      }

      if (l.startsWith('#EXTHTTP:')) {
        inExtHttp = true;
        extHttpAcc = l.replace('#EXTHTTP:', '').trim();
      } else if (l.startsWith('#KODIPROP:')) {
        const kv = l.replace('#KODIPROP:', '').trim();
        const eq = kv.indexOf('=');
        if (eq > -1) {
          const key = kv.substring(0, eq).trim();
          const val = kv.substring(eq + 1).trim();
          channel.kodiprop[key] = val;
        }
      } else if (l && !l.startsWith('#')) {
        channel.url = l;
        break;
      }
    }

    if (channel.url && channel.exthttpRaw) {
      channels.push(channel);
    }
  }

  return channels;
}

/**
 * Extrae el valor de un atributo de una línea #EXTINF.
 * @param {string} line
 * @param {string} attr
 * @returns {string|null}
 */
function _extractAttr(line, attr) {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m  = line.match(re);
  return m ? m[1] : null;
}

/**
 * Reescribe las URLs de los canales para que apunten al servidor de captura.
 * @param {Array<ChannelEntry>} channels
 * @param {string} captureHost - ej. 'http://127.0.0.1:18080'
 * @returns {Array<ChannelEntry>} - Copia con URLs modificadas
 */
function redirectToCapture(channels, captureHost) {
  return channels.map(ch => ({
    ...ch,
    urlOriginal : ch.url,
    url         : `${captureHost}/stream/${ch.index}?ch=${encodeURIComponent(ch.name)}`
  }));
}

module.exports = { parseM3U8, redirectToCapture };
