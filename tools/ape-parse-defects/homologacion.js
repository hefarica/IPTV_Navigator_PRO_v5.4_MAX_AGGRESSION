#!/usr/bin/env node
/**
 * homologacion.js — SSOT LEÍDO DEL LAB BULLETPROOF. Cero valores hardcodeados.
 *
 * CORRECCIÓN DEL OPERADOR, que este fichero implementa: la versión anterior declaraba los valores
 * canónicos como constantes aquí dentro. Eso viola iptv-no-hardcode-doctrine —los datos productivos no
 * son literales en código— y además crea una segunda verdad frente al laboratorio.
 *
 * La fuente es el LAB Bulletproof, la misma que alimenta el panel
 * "🛡 LAB Bulletproof Details — P4 (… fields, read-only desde LAB Excel)" de profile-manager-v9.js,
 * cuyo comentario dice: «read-only — los valores los calibra el solver del LAB».
 *
 * Por tanto este módulo ya no DECLARA el valor: declara DE QUÉ RUTA DEL LAB SE LEE. El valor canónico de
 * cada familia sale de la capa que el generador emite (la última de la cadena de precedencia), de modo
 * que laboratorio y generador coinciden por construcción, no por coincidencia.
 *
 * Si el LAB no trae la ruta, el valor es null y se reporta NO_OBTENIBLE. Nunca un default inventado:
 * un hueco de dato no se tapa con un número plausible.
 *
 * Uso:
 *   node homologacion.js [--lab ruta.json] [--perfil P4]        mapa: SSOT (leído del LAB) + herederos
 *   node homologacion.js --json [--lab ...] [--perfil ...]      artefacto para otro proceso
 *   node homologacion.js --set-fuente cache_red=optimized_knobs.buffer_seconds
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** LAB por defecto: el mismo certificado que el panel declara leer. */
const LAB_POR_DEFECTO = path.join(__dirname, '..', '..',
  'audit_teams_REA', 'evidence', 'lab_master_22.6.0.CERTIFIED-BULLETPROOF-2026-10-26.json');
const PERFIL_POR_DEFECTO = 'P4';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FAMILIAS — qué magnitud es, DE DÓNDE SE LEE en el LAB, y quién hereda.
// Ningún valor numérico aquí. `fuente` es una ruta dentro del perfil del LAB.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const FAMILIAS = [
  {
    id: 'cache_red', unidad: 'ms', magnitud: 'colchón de red antes de tocar el stream',
    // El generador convierte buffer_seconds*1000 en network-caching, así que la fuente es el knob.
    fuente: 'optimized_knobs.buffer_seconds', fuente_unidad: 's',
    homologos: [
      { clave: 'network-caching',          motor: 'vlc',     unidad: 'ms' },
      { clave: 'live-caching',             motor: 'vlc',     unidad: 'ms' },
      { clave: 'file-caching',             motor: 'vlc',     unidad: 'ms' },
      { clave: 'sout-mux-caching',         motor: 'vlc',     unidad: 'ms' },
      { clave: 'network_caching_ms',       motor: 'actor',   unidad: 'ms' },
      { clave: 'networkCachingMs',         motor: 'lab',     unidad: 'ms' },
      { clave: 'buffer_seconds',           motor: 'knob',    unidad: 's' },
      { clave: 'bufferSeconds',            motor: 'lab',     unidad: 's' }
    ]
  },
  {
    id: 'reintentos_http', unidad: 'count', magnitud: 'reintentos antes de rendirse',
    fuente: 'optimized_knobs.reconnect_attempts', fuente_unidad: 'count',
    homologos: [
      { clave: 'http-max-retries',         motor: 'vlc',     unidad: 'count' },
      { clave: 'network-reconnect-count',  motor: 'vlc',     unidad: 'count' },
      { clave: 'reconnect_attempts',       motor: 'knob',    unidad: 'count' }
    ]
  },
  {
    id: 'timeout_http', unidad: 'ms', magnitud: 'espera máxima por respuesta',
    fuente: 'vlcopt.http-timeout', fuente_unidad: 'ms',
    homologos: [{ clave: 'http-timeout', motor: 'vlc', unidad: 'ms' }]
  },
  {
    id: 'abr_factor', unidad: 'ratio', magnitud: 'fracción de ancho de banda para subir de nivel',
    fuente: 'optimized_knobs.abrBandWidthFactor', fuente_unidad: 'ratio',
    homologos: [{ clave: 'abrBandWidthFactor', motor: 'hls.js', unidad: 'ratio' }]
  },
  {
    id: 'livesync_rate', unidad: 'ratio', magnitud: 'velocidad para alcanzar el directo',
    fuente: 'optimized_knobs.maxLiveSyncPlaybackRate', fuente_unidad: 'ratio',
    homologos: [{ clave: 'maxLiveSyncPlaybackRate', motor: 'hls.js', unidad: 'ratio' }]
  },
  {
    id: 'max_buffer_length', unidad: 'count', magnitud: 'buffer objetivo de hls.js',
    fuente: 'actor_injections.player.hlsjs.maxBufferLength', fuente_unidad: 'count',
    homologos: [{ clave: 'maxBufferLength', motor: 'hls.js', unidad: 'count' }]
  },
  {
    id: 'max_max_buffer_len', unidad: 'count', magnitud: 'techo del buffer de hls.js',
    fuente: 'actor_injections.player.hlsjs.maxMaxBufferLength', fuente_unidad: 'count',
    homologos: [{ clave: 'maxMaxBufferLength', motor: 'hls.js', unidad: 'count' }]
  },
  {
    id: 'nudge_offset', unidad: 'ratio', magnitud: 'desplazamiento por corrección de desfase',
    fuente: 'actor_injections.player.hlsjs.nudgeOffset', fuente_unidad: 'ratio',
    homologos: [{ clave: 'nudgeOffset', motor: 'hls.js', unidad: 'ratio' }]
  },
  {
    id: 'nudge_max_retry', unidad: 'count', magnitud: 'correcciones de desfase máximas',
    fuente: 'optimized_knobs.nudgeMaxRetry', fuente_unidad: 'count',
    homologos: [{ clave: 'nudgeMaxRetry', motor: 'hls.js', unidad: 'count' }]
  },
  {
    id: 'watchdog', unidad: 'count', magnitud: 'periodo del vigilante de buffer alto',
    fuente: 'actor_injections.player.hlsjs.highBufferWatchdogPeriod', fuente_unidad: 'count',
    homologos: [{ clave: 'highBufferWatchdogPeriod', motor: 'hls.js', unidad: 'count' }]
  },
  {
    id: 'frag_tolerance', unidad: 'ratio', magnitud: 'tolerancia al buscar fragmento',
    fuente: 'actor_injections.player.hlsjs.maxFragLookUpTolerance', fuente_unidad: 'ratio',
    homologos: [{ clave: 'maxFragLookUpTolerance', motor: 'hls.js', unidad: 'ratio' }]
  },
  {
    id: 'luminancia_hdr', unidad: 'nits', magnitud: 'pico de luminancia declarado al panel',
    fuente: 'actor_injections.panel.peak_luminance_nits', fuente_unidad: 'nits',
    homologos: [
      { clave: 'peak_luminance_nits', motor: 'panel', unidad: 'nits' },
      { clave: 'peakLuminanceNits',   motor: 'lab',   unidad: 'nits' }
    ]
  },
  {
    id: 'prefetch', unidad: 'count', magnitud: 'segmentos precargados',
    fuente: 'prefetch_config.prefetch_segments', fuente_unidad: 'count',
    homologos: [
      { clave: 'prefetch_segments', motor: 'prefetch', unidad: 'count' },
      { clave: 'prefetchSegments',  motor: 'lab',      unidad: 'count' }
    ]
  },
  {
    id: 'privacidad', unidad: 'bool', magnitud: 'cabecera Do-Not-Track',
    fuente: 'player_enslavement.level_3_per_channel.EXTHTTP.DNT', fuente_unidad: 'bool',
    homologos: [{ clave: 'DNT', motor: 'exthttp', unidad: 'bool' }]
  },
  // Añadida al auditar el P4 REAL del 2026-10-26: de las 8 claves numéricas que aparecen en >=2 sitios,
  // 6 estaban cubiertas y esta no. settings.bufferFloorPct=20 contra prefetch_config.buffer_floor_pct=30:
  // el mismo suelo de buffer dicho con dos números. La fuente es la de prefetch porque es la que se lee.
  {
    id: 'buffer_floor', unidad: 'pct', magnitud: 'suelo de buffer, en porcentaje',
    fuente: 'prefetch_config.buffer_floor_pct', fuente_unidad: 'pct',
    homologos: [{ clave: 'bufferFloorPct', motor: 'lab', unidad: 'pct' }]
  }
];

// Duplicados de nombre exacto: no llevan valor, sólo dicen dónde están las dos apariciones.
const DUPLICADOS = [
  { clave: 'network-caching',          familia: 'cache_red',          rutas: ['vlcopt.network-caching', 'player_enslavement.level_3_per_channel.EXTVLCOPT.network-caching'], conservar: 'player_enslavement.level_3_per_channel.EXTVLCOPT.network-caching' },
  { clave: 'abrBandWidthFactor',       familia: 'abr_factor',         rutas: ['hlsjs.abrBandWidthFactor', 'optimized_knobs.abrBandWidthFactor', 'actor_injections.player.exoplayer.abrBandWidthFactor'], conservar: 'actor_injections.player.exoplayer.abrBandWidthFactor' },
  { clave: 'maxLiveSyncPlaybackRate',  familia: 'livesync_rate',      rutas: ['settings.maxLiveSyncPlaybackRate', 'hlsjs.maxLiveSyncPlaybackRate', 'optimized_knobs.maxLiveSyncPlaybackRate', 'actor_injections.player.hlsjs.maxLiveSyncPlaybackRate', 'actor_injections.player.exoplayer.maxLiveSyncPlaybackRate'], conservar: 'actor_injections.player.hlsjs.maxLiveSyncPlaybackRate' },
  { clave: 'maxBufferLength',          familia: 'max_buffer_length',  rutas: ['hlsjs.maxBufferLength', 'actor_injections.player.hlsjs.maxBufferLength'], conservar: 'actor_injections.player.hlsjs.maxBufferLength' },
  { clave: 'maxMaxBufferLength',       familia: 'max_max_buffer_len', rutas: ['hlsjs.maxMaxBufferLength', 'actor_injections.player.hlsjs.maxMaxBufferLength'], conservar: 'actor_injections.player.hlsjs.maxMaxBufferLength' },
  { clave: 'nudgeOffset',              familia: 'nudge_offset',       rutas: ['hlsjs.nudgeOffset', 'actor_injections.player.hlsjs.nudgeOffset'], conservar: 'actor_injections.player.hlsjs.nudgeOffset' },
  { clave: 'nudgeMaxRetry',            familia: 'nudge_max_retry',    rutas: ['hlsjs.nudgeMaxRetry', 'optimized_knobs.nudgeMaxRetry', 'actor_injections.player.hlsjs.nudgeMaxRetry', 'actor_injections.player.exoplayer.nudgeMaxRetry'], conservar: 'actor_injections.player.hlsjs.nudgeMaxRetry' },
  { clave: 'highBufferWatchdogPeriod', familia: 'watchdog',           rutas: ['hlsjs.highBufferWatchdogPeriod', 'actor_injections.player.hlsjs.highBufferWatchdogPeriod'], conservar: 'actor_injections.player.hlsjs.highBufferWatchdogPeriod' },
  { clave: 'maxFragLookUpTolerance',   familia: 'frag_tolerance',     rutas: ['hlsjs.maxFragLookUpTolerance', 'actor_injections.player.hlsjs.maxFragLookUpTolerance'], conservar: 'actor_injections.player.hlsjs.maxFragLookUpTolerance' },
  { clave: 'peak_luminance_nits',      familia: 'luminancia_hdr',     rutas: ['settings.peak_luminance_nits', 'settings.peakLuminanceNits', 'actor_injections.panel.peak_luminance_nits'], conservar: 'actor_injections.panel.peak_luminance_nits' },
  { clave: 'DNT',                      familia: 'privacidad',         rutas: ['headers.DNT', 'player_enslavement.level_3_per_channel.EXTHTTP.DNT'], conservar: 'player_enslavement.level_3_per_channel.EXTHTTP.DNT' },
  // Añadido al auditar el P4 real: settings.bit_depth y settings.bitDepth valen 8 los dos. Mismo objeto,
  // dos grafías. No es un homologo (no hay dos motores): es redundancia pura, sobra una.
  { clave: 'bit_depth',                familia: null,                 rutas: ['settings.bit_depth', 'settings.bitDepth'], conservar: 'settings.bit_depth' },
  { clave: 'bufferFloorPct',           familia: 'buffer_floor',       rutas: ['settings.bufferFloorPct', 'prefetch_config.buffer_floor_pct'], conservar: 'prefetch_config.buffer_floor_pct' }
];

const LEGITIMOS = [
  { clave: 'pq_ai_dnr_enable', motivo: 'global vs content_overrides.deportes: apagar DNR en deportes es decisión de contenido' },
  { clave: 'pq_dnr_enable',    motivo: 'idem' }
];

/** Lee una ruta 'a.b.c' dentro de un objeto. Devuelve {encontrado, valor, ruta}. */
function leerRuta(obj, ruta) {
  const partes = String(ruta).split('.');
  let cur = obj;
  for (const p of partes) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) {
      return { encontrado: false, valor: null, ruta };
    }
    cur = cur[p];
  }
  return { encontrado: true, valor: cur, ruta };
}

/** Carga el perfil del LAB Bulletproof. Fail-honest: si no está, error explícito. */
function cargarLab(ruta = LAB_POR_DEFECTO, perfil = PERFIL_POR_DEFECTO) {
  if (!fs.existsSync(ruta)) throw new Error(`LAB no encontrado: ${ruta}`);
  const bruto = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const cont = bruto.profiles_calibrated || bruto.profiles || bruto;
  const p = cont[perfil];
  if (!p) throw new Error(`perfil ${perfil} ausente en ${ruta}`);
  return { ruta, perfil, fields: p, lab_version: bruto.lab_version || null, exported_at: bruto.exported_at || null };
}

function convertir(v, desde, hacia) {
  const n = Number(v);
  if (!isFinite(n)) return v;
  if (!desde || !hacia || desde === hacia) return n;
  if (desde === 's' && hacia === 'ms') return n * 1000;
  if (desde === 'ms' && hacia === 's') return n / 1000;
  return n;
}

/**
 * EL SSOT SE DERIVA DEL LAB. No hay constante que valga.
 * Devuelve por familia: valor (o null), unidad, ruta leída, y si se encontró.
 */
function derivarSSOT(lab) {
  const ssot = {};
  for (const fam of FAMILIAS) {
    const r = leerRuta(lab.fields, fam.fuente);
    ssot[fam.id] = {
      valor: r.encontrado ? convertir(r.valor, fam.fuente_unidad, fam.unidad) : null,
      unidad: fam.unidad,
      magnitud: fam.magnitud,
      fuente: fam.fuente,
      fuente_unidad: fam.fuente_unidad,
      fuente_valor_crudo: r.encontrado ? r.valor : null,
      encontrado: r.encontrado
    };
  }
  return ssot;
}

/** Índice plano de todos los homólogos, cada uno con el id de su familia. */
function homologosPlanos() {
  const out = [];
  for (const fam of FAMILIAS) for (const h of fam.homologos) out.push({ ...h, familia: fam.id });
  return out;
}

/** El valor de un homólogo NO se escribe: se hereda del SSOT derivado del LAB. */
function heredar(homologo, ssot) {
  const fam = ssot[homologo.familia];
  if (!fam) throw new Error(`homólogo ${homologo.clave} apunta a familia inexistente: ${homologo.familia}`);
  if (fam.valor === null) return null;  // fail-honest: sin dato, sin número inventado
  return convertir(fam.valor, fam.unidad, homologo.unidad);
}

/** Tabla completa: quién manda (leído del LAB), quién hereda cuánto, dónde están las duplicaciones. */
function tabla(lab) {
  const ssot = derivarSSOT(lab);
  return FAMILIAS.map((fam) => {
    const s = ssot[fam.id];
    return {
      familia: fam.id,
      ssot: s.valor,
      unidad: s.unidad,
      magnitud: fam.magnitud,
      fuente: s.fuente,
      fuente_encontrada: s.encontrado,
      fuente_valor_crudo: s.fuente_valor_crudo,
      heredan: fam.homologos.map((h) => ({
        clave: h.clave, motor: h.motor, unidad: h.unidad, valor_heredado: heredar({ ...h, familia: fam.id }, ssot)
      })),
      duplicados: DUPLICADOS.filter((d) => d.familia === fam.id)
    };
  });
}

const norm = (k) => String(k).toLowerCase().replace(/[._-]/g, '');

/** Borra una ruta 'a.b.c'. Devuelve true si borró algo. */
function borrarRuta(obj, ruta) {
  const partes = String(ruta).split('.');
  let cur = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (cur == null || typeof cur !== 'object' || !(partes[i] in cur)) return false;
    cur = cur[partes[i]];
  }
  const ult = partes[partes.length - 1];
  if (cur == null || typeof cur !== 'object' || !(ult in cur)) return false;
  delete cur[ult];
  return true;
}

/**
 * DEDUPLICAR — la mitad literal de la regla del operador: los campos que se llaman IGUAL sobran, uno.
 * Se conserva la ruta que el generador emite (la última de la cadena de precedencia) y se borran las demás.
 * Devuelve la copia y la lista de rutas eliminadas, para que nada desaparezca en silencio.
 */
function deduplicar(fields) {
  const clon = JSON.parse(JSON.stringify(fields));
  const eliminados = [];
  for (const d of DUPLICADOS) {
    if (!d.conservar) continue;
    for (const r of d.rutas) {
      if (r === d.conservar) continue;
      if (borrarRuta(clon, r)) eliminados.push({ clave: d.clave, ruta: r, se_conserva: d.conservar });
    }
  }
  return { fields: clon, eliminados };
}

/**
 * APLICAR — la regla completa, en orden:
 *   1. deduplicar: el mismo nombre, una sola vez (se conserva la capa que emite)
 *   2. sincronizar: cada homólogo al valor que dice el LAB, convertido a SU unidad
 * Devuelve el objeto canónico, lo eliminado y lo cambiado. Idempotente.
 */
function aplicar(fields, lab) {
  const d = deduplicar(fields);
  const s = sincronizar(d.fields, lab);
  return { fields: s.fields, eliminados: d.eliminados, cambios: s.cambios, ssot: s.ssot };
}

/**
 * ARRAY DE HOMOLOGOS — el "mismo valor en diferentes idiomas", como lista plana.
 * Cada entrada dice en qué motor se escribe, con qué clave y con qué valor heredado del LAB.
 * Esto es lo que el sistema consume: no un objeto anidado, sino una tabla explícita.
 */
function arrayHomologos(lab) {
  const ssot = derivarSSOT(lab);
  const out = [];
  for (const fam of FAMILIAS) {
    const s = ssot[fam.id];
    for (const h of fam.homologos) {
      out.push({
        familia: fam.id,
        clave: h.clave,
        motor: h.motor,
        unidad: h.unidad,
        valor: heredar({ ...h, familia: fam.id }, ssot),
        fuente_lab: s.fuente,
        ssot: s.valor
      });
    }
  }
  return out;
}

/**
 * SINCRONIZAR: aplica el SSOT derivado del LAB a todos los homólogos de un objeto `fields`.
 * Devuelve una COPIA y la lista de cambios. No muta el original.
 */
function sincronizar(fields, lab) {
  const ssot = derivarSSOT(lab);
  const porClave = new Map();
  for (const h of homologosPlanos()) {
    const n = norm(h.clave);
    if (!porClave.has(n)) porClave.set(n, []);
    porClave.get(n).push(h);
  }
  const cambios = [];
  const clon = JSON.parse(JSON.stringify(fields));
  const walk = (obj, ruta) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const r = ruta ? `${ruta}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v, r); continue; }
      if (Array.isArray(v)) continue;
      if (typeof v === 'string' && v.includes(',')) continue;
      const hs = porClave.get(norm(k));
      if (!hs) continue;
      const h = hs[0];
      const nuevo = heredar(h, ssot);
      if (nuevo === null) continue;             // sin dato en el LAB: no se toca, no se inventa
      if (String(v) === String(nuevo)) continue;
      cambios.push({ ruta: r, antes: v, despues: nuevo, familia: h.familia, fuente: ssot[h.familia].fuente });
      obj[k] = nuevo;
    }
  };
  walk(clon, '');
  return { fields: clon, cambios, ssot };
}

module.exports = {
  borrarRuta, deduplicar, aplicar, arrayHomologos,
  FAMILIAS, DUPLICADOS, LEGITIMOS,
  LAB_POR_DEFECTO, PERFIL_POR_DEFECTO,
  leerRuta, cargarLab, derivarSSOT, heredar, tabla, convertir, homologosPlanos, sincronizar
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const labRuta = arg('--lab', LAB_POR_DEFECTO);
  const perfil = arg('--perfil', PERFIL_POR_DEFECTO);

  let lab;
  try { lab = cargarLab(labRuta, perfil); }
  catch (e) { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(3); }

  if (args.includes('--array')) {
    process.stdout.write(JSON.stringify(arrayHomologos(lab), null, 2) + '\n');
    process.exit(0);
  }

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({
      lab: { ruta: lab.ruta, perfil: lab.perfil, version: lab.lab_version, exportado: lab.exported_at },
      familias: tabla(lab), legitimas: LEGITIMOS
    }, null, 2) + '\n');
    process.exit(0);
  }

  process.stdout.write(`LAB: ${lab.perfil}  version=${lab.lab_version}  exportado=${lab.exported_at}\n`);
  process.stdout.write(`     ${lab.ruta}\n`);
  let sinFuente = 0, totalH = 0;
  for (const f of tabla(lab)) {
    const marca = f.fuente_encontrada ? '' : '   << NO_OBTENIBLE';
    if (!f.fuente_encontrada) sinFuente++;
    process.stdout.write(`\n${f.familia}   SSOT=${f.ssot === null ? 'null' : f.ssot} ${f.unidad}   <- ${f.fuente}${marca}\n`);
    for (const h of f.heredan) { totalH++; process.stdout.write(`    HEREDA  ${h.clave.padEnd(26)} ${h.motor.padEnd(10)} = ${h.valor_heredado}\n`); }
  }
  process.stdout.write(`\nFAMILIAS=${FAMILIAS.length}  HEREDEROS=${totalH}  SIN_FUENTE=${sinFuente}\n`);
  process.stdout.write('Ningun valor canonico esta escrito en este fichero: todos se leen del LAB.\n');
  process.exit(sinFuente ? 4 : 0);
}
