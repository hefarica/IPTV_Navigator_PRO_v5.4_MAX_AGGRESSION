#!/usr/bin/env node
/**
 * homologacion.js — SSOT + herencia. Ningún valor se escribe dos veces.
 *
 * REGLA DEL OPERADOR, que este fichero implementa al pie de la letra:
 *   - Los campos que se llaman IGUAL son duplicados: sobra el que no se lee.
 *   - Los que NO se llaman igual pero miden lo mismo son HOMÓLOGOS: el mismo número escrito en el idioma
 *     de cada motor (VLC, Kodi/ISA, hls.js, ExoPlayer, panel HDR, VPP del SoC).
 *   - Los homólogos NO llevan valor propio: lo HEREDAN del SSOT de su familia. Si mañana se cambia
 *     SSOT.cache_red.valor, los seis homólogos cambian solos. No hay un segundo sitio donde tocarlo.
 *
 * Por qué importa: antes esto era un mapa con el número repetido en cada fila. Cambiar el canónico
 * obligaba a acordarse de reescribir a mano los homólogos, y ese es exactamente el fallo que produjo la
 * lista: network-caching a 105000 en un sitio y a 15000 en otro porque alguien tocó uno solo.
 *
 * Uso:
 *   node homologacion.js                          mapa completo (SSOT + quién hereda + qué sobra)
 *   node homologacion.js --json                   el artefacto, para que lo consuma otro proceso
 *   node homologacion.js --set cache_red=30000    cambia el SSOT y muestra el efecto en TODOS los herederos
 */
'use strict';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SSOT — la ÚNICA declaración de valor. Todo lo demás hereda de aquí.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const SSOT = {
  cache_red:          { valor: 15000, unidad: 'ms',    magnitud: 'colchón de red antes de tocar el stream' },
  reintentos_http:    { valor: 350,   unidad: 'count', magnitud: 'reintentos antes de rendirse' },
  timeout_http:       { valor: 30000, unidad: 'ms',    magnitud: 'espera máxima por respuesta' },
  abr_factor:         { valor: 0.85,  unidad: 'ratio', magnitud: 'fracción de ancho de banda para subir de nivel' },
  livesync_rate:      { valor: 1.25,  unidad: 'ratio', magnitud: 'velocidad para alcanzar el directo' },
  max_buffer_length:  { valor: 105,   unidad: 'count', magnitud: 'buffer objetivo de hls.js' },
  max_max_buffer_len: { valor: 210,   unidad: 'count', magnitud: 'techo del buffer de hls.js' },
  nudge_offset:       { valor: 0.1,   unidad: 'ratio', magnitud: 'desplazamiento por corrección de desfase' },
  nudge_max_retry:    { valor: 13,    unidad: 'count', magnitud: 'correcciones de desfase máximas' },
  watchdog:           { valor: 3,     unidad: 'count', magnitud: 'periodo del vigilante de buffer alto' },
  frag_tolerance:     { valor: 0.25,  unidad: 'ratio', magnitud: 'tolerancia al buscar fragmento' },
  luminancia_hdr:     { valor: 4000,  unidad: 'nits',  magnitud: 'pico de luminancia declarado al panel' },
  prefetch:           { valor: 12,    unidad: 'count', magnitud: 'segmentos precargados' },
  privacidad:         { valor: 1,     unidad: 'bool',  magnitud: 'cabecera Do-Not-Track' }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HOMÓLOGOS — cada uno declara DE QUIÉN hereda. Cero valores aquí.
// `unidad` es la del motor; si difiere del SSOT, la herencia convierte.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const HOMOLOGOS = [
  // caché de red — seis formas de decir el mismo colchón
  { clave: 'network-caching',         familia: 'cache_red',      motor: 'vlc',      unidad: 'ms' },
  { clave: 'live-caching',            familia: 'cache_red',      motor: 'vlc',      unidad: 'ms' },
  { clave: 'file-caching',            familia: 'cache_red',      motor: 'vlc',      unidad: 'ms' },
  { clave: 'sout-mux-caching',        familia: 'cache_red',      motor: 'vlc',      unidad: 'ms' },
  { clave: 'network_caching_ms',      familia: 'cache_red',      motor: 'actor',    unidad: 'ms' },
  { clave: 'networkCachingMs',        familia: 'cache_red',      motor: 'lab',      unidad: 'ms' },
  // el mismo colchón en segundos: hereda de cache_red y se convierte
  { clave: 'buffer_seconds',          familia: 'cache_red',      motor: 'knob',     unidad: 's' },
  { clave: 'bufferSeconds',           familia: 'cache_red',      motor: 'lab',      unidad: 's' },
  { clave: 'reconnect_attempts',      familia: 'reintentos_http', motor: 'knob',    unidad: 'count' },
  { clave: 'http-max-retries',        familia: 'reintentos_http', motor: 'vlc',     unidad: 'count' },
  { clave: 'network-reconnect-count', familia: 'reintentos_http', motor: 'vlc',     unidad: 'count' },
  { clave: 'http-timeout',            familia: 'timeout_http',   motor: 'vlc',      unidad: 'ms' },
  { clave: 'abrBandWidthFactor',      familia: 'abr_factor',     motor: 'hls.js',   unidad: 'ratio' },
  { clave: 'maxLiveSyncPlaybackRate', familia: 'livesync_rate',  motor: 'hls.js',   unidad: 'ratio' },
  { clave: 'maxBufferLength',         familia: 'max_buffer_length', motor: 'hls.js', unidad: 'count' },
  { clave: 'maxMaxBufferLength',      familia: 'max_max_buffer_len', motor: 'hls.js', unidad: 'count' },
  { clave: 'nudgeOffset',             familia: 'nudge_offset',   motor: 'hls.js',   unidad: 'ratio' },
  { clave: 'nudgeMaxRetry',           familia: 'nudge_max_retry', motor: 'hls.js',  unidad: 'count' },
  { clave: 'highBufferWatchdogPeriod', familia: 'watchdog',      motor: 'hls.js',   unidad: 'count' },
  { clave: 'maxFragLookUpTolerance',  familia: 'frag_tolerance', motor: 'hls.js',   unidad: 'ratio' },
  { clave: 'peak_luminance_nits',     familia: 'luminancia_hdr', motor: 'panel',    unidad: 'nits' },
  { clave: 'peakLuminanceNits',       familia: 'luminancia_hdr', motor: 'lab',      unidad: 'nits' },
  { clave: 'prefetch_segments',       familia: 'prefetch',       motor: 'prefetch', unidad: 'count' },
  { clave: 'prefetchSegments',        familia: 'prefetch',       motor: 'lab',      unidad: 'count' },
  { clave: 'DNT',                     familia: 'privacidad',     motor: 'exthttp',  unidad: 'bool' }
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DUPLICADOS EXACTOS — mismo nombre en varias capas. Se conserva el que se emite; el resto sobra.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const DUPLICADOS = [
  { clave: 'network-caching',          familia: 'cache_red',            motivo: 'vlcopt (15000) y player_enslavement.L3 (105000); sólo L3 se emite' },
  { clave: 'abrBandWidthFactor',       familia: 'abr_factor',           motivo: 'hlsjs (95, inválido) · optimized_knobs (0.85) · actor.exoplayer (0.85)' },
  { clave: 'maxLiveSyncPlaybackRate',  familia: 'livesync_rate',        motivo: 'settings (15) · hlsjs (15) · optimized_knobs (1.25) · dos actores (1.25)' },
  { clave: 'maxBufferLength',          familia: 'max_buffer_length',    motivo: 'hlsjs (50, muerto) · actor.hlsjs (105, emitido)' },
  { clave: 'maxMaxBufferLength',       familia: 'max_max_buffer_len',   motivo: 'hlsjs (50, muerto) · actor.hlsjs (210, emitido)' },
  { clave: 'nudgeOffset',              familia: 'nudge_offset',         motivo: 'hlsjs (1, muerto) · actor.hlsjs (0.1, emitido)' },
  { clave: 'nudgeMaxRetry',            familia: 'nudge_max_retry',      motivo: 'hlsjs (10) · optimized_knobs (13) · dos actores (13)' },
  { clave: 'highBufferWatchdogPeriod', familia: 'watchdog',             motivo: 'hlsjs (1, muerto) · actor.hlsjs (3, emitido)' },
  { clave: 'maxFragLookUpTolerance',   familia: 'frag_tolerance',       motivo: 'hlsjs (25, muerto) · actor.hlsjs (0.25, emitido)' },
  { clave: 'peak_luminance_nits',      familia: 'luminancia_hdr',       motivo: 'settings x2 (10000, muertas) · actor.panel (4000, emitido)' },
  { clave: 'DNT',                      familia: 'privacidad',           motivo: 'headers (0) · player_enslavement.L3.EXTHTTP (1, emitido)' }
];

// Discrepancias INTENCIONALES: overrides por categoría. No son conflictos.
const LEGITIMOS = [
  { clave: 'pq_ai_dnr_enable', motivo: 'global 1; 0 en content_overrides.deportes es decisión de contenido', global: 1, overrides: { deportes: 0 } },
  { clave: 'pq_dnr_enable',    motivo: 'idem', global: 1, overrides: { deportes: 0 } }
];

/** Convierte entre unidades de la misma magnitud. */
function convertir(valor, desde, hacia) {
  const n = Number(valor);
  if (!isFinite(n)) return valor;
  if (!desde || !hacia || desde === hacia) return n;
  if (desde === 's' && hacia === 'ms') return n * 1000;
  if (desde === 'ms' && hacia === 's') return n / 1000;
  return n;
}

/** EL VALOR DE UN HOMÓLOGO NO SE ESCRIBE: SE HEREDA. Única función que lo produce. */
function heredar(homologo, ssot = SSOT) {
  const fam = ssot[homologo.familia];
  if (!fam) throw new Error(`homólogo ${homologo.clave} apunta a familia inexistente: ${homologo.familia}`);
  return convertir(fam.valor, fam.unidad, homologo.unidad);
}

/** Tabla para consumo humano: quién manda, quién hereda cuánto, quién sobra. */
function tabla(ssot = SSOT) {
  return Object.keys(ssot).map((id) => {
    const fam = ssot[id];
    const here = HOMOLOGOS.filter((h) => h.familia === id).map((h) => ({
      clave: h.clave, motor: h.motor, unidad: h.unidad, valor_heredado: heredar(h, ssot)
    }));
    const dbl = DUPLICADOS.filter((d) => d.familia === id).map((d) => ({ clave: d.clave, motivo: d.motivo }));
    return { familia: id, ssot: fam.valor, unidad: fam.unidad, magnitud: fam.magnitud, heredan: here, duplicados: dbl };
  });
}

const norm = (k) => String(k).toLowerCase().replace(/[._-]/g, '');

/**
 * SINCRONIZAR: aplica el SSOT a todos los homólogos de un objeto fields.
 * Devuelve una COPIA con los valores heredados y la lista de cambios. No muta el original.
 * Esto es lo que hace que cambiar el SSOT se propague solo.
 */
function sincronizar(fields, ssot = SSOT) {
  const porClave = new Map();
  for (const h of HOMOLOGOS) {
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
      if (Array.isArray(v)) continue;                        // rangos y listas por perfil
      if (typeof v === 'string' && v.includes(',')) continue; // valores por perfil serializados
      const hs = porClave.get(norm(k));
      if (!hs) continue;
      const h = hs[0];
      const nuevo = heredar(h, ssot);
      if (String(v) === String(nuevo)) continue;
      cambios.push({ ruta: r, antes: v, despues: nuevo, familia: h.familia });
      obj[k] = nuevo;
    }
  };
  walk(clon, '');
  return { fields: clon, cambios };
}

module.exports = { SSOT, HOMOLOGOS, DUPLICADOS, LEGITIMOS, heredar, tabla, sincronizar, convertir };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--json') {
    process.stdout.write(JSON.stringify({ ssot: SSOT, homologos: HOMOLOGOS, duplicados: DUPLICADOS, legitimas: LEGITIMOS, tabla: tabla() }, null, 2) + '\n');
    process.exit(0);
  }

  if (args[0] === '--set') {
    const [id, val] = String(args[1] || '').split('=');
    if (!SSOT[id]) { process.stderr.write(`familia desconocida: ${id}\n`); process.exit(3); }
    const antes = SSOT[id].valor;
    SSOT[id].valor = Number(val);
    process.stderr.write(`SSOT.${id}: ${antes} -> ${SSOT[id].valor} ${SSOT[id].unidad}\n`);
    process.stderr.write('efecto heredado (sin tocar nada mas):\n');
    for (const h of HOMOLOGOS.filter((x) => x.familia === id)) {
      process.stderr.write(`  ${h.clave.padEnd(26)} ${h.motor.padEnd(10)} = ${heredar(h)}\n`);
    }
    process.exit(0);
  }

  let totalH = 0, totalD = 0;
  for (const f of tabla()) {
    process.stdout.write(`\n${f.familia}  SSOT=${f.ssot} ${f.unidad}\n  ${f.magnitud}\n`);
    for (const h of f.heredan) { totalH++; process.stdout.write(`    HEREDA  ${h.clave.padEnd(26)} ${h.motor.padEnd(10)} = ${h.valor_heredado} ${h.unidad}\n`); }
    for (const d of f.duplicados) { totalD++; process.stdout.write(`    QUITAR  ${d.clave.padEnd(26)} ${d.motivo}\n`); }
  }
  process.stdout.write(`\nFAMILIAS=${Object.keys(SSOT).length}  HOMOLOGOS=${totalH}  DUPLICADOS=${totalD}  LEGITIMOS=${LEGITIMOS.length}\n`);
  process.stdout.write('Ningun valor esta escrito dos veces: todo hereda de SSOT.\n');
}
