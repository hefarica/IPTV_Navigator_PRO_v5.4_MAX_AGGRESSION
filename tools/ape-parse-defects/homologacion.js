#!/usr/bin/env node
/**
 * homologacion.js — el mapa canónico de la metadata `ape-lab-metadata-v1`.
 *
 * LA IDEA, en las palabras del operador: los campos que se llamen IGUAL son duplicados y sobran; los que
 * NO se llamen igual pero sean la misma magnitud son HOMÓLOGOS — el mismo valor escrito en el idioma de
 * cada motor (VLC, Kodi/ISA, hls.js, ExoPlayer, panel HDR, VPP del SoC) — y hay que dejarlos todos con
 * EL MISMO VALOR, para que el sistema diga lo mismo en cinco idiomas distintos y la configuración llegue
 * a todos lados sin que un motor reciba una verdad y otro otra.
 *
 * Por qué existe: hoy `network-caching` vale 105000 en VLC y `network_caching_ms` vale 105000 en el
 * actor, pero `settings.networkCachingMs` vale 15000 y `optimized_knobs.buffer_seconds` vale 50. Eso no
 * son tres opiniones: es UNA magnitud partida en tres verdades. Este mapa declara cuál es la canónica y
 * exige que todos los homólogos la digan.
 *
 * Formato por familia:
 *   id            identificador estable
 *   magnitud      qué se está midiendo
 *   unidad        unidad de valor_canonico ('ms', 's', 'ratio', 'nits', 'bool', 'count')
 *   valor_canonico el único valor admisible para toda la familia
 *   homologos[]   {clave, motor, unidad, nota} — NO se borran: se sincronizan
 *   duplicados[]  {clave, motivo} — nombre idéntico: sobre el que no se lee
 *   legitimo[]    {clave, nota} — discrepancia intencional (overrides por categoría)
 */
'use strict';

const FAMILIAS = [
  {
    id: 'cache_red',
    magnitud: 'colchón de red antes de tocar el stream',
    unidad: 'ms',
    // 15 s cubre un bache de red de 15 s sin cortar imagen y no se percibe como ir por detrás del directo.
    // 105 s (el valor vigente en la lista) son 105 s de latencia. Este es el número a decidir.
    valor_canonico: 15000,
    homologos: [
      { clave: 'network-caching',        motor: 'vlc',   unidad: 'ms', nota: 'caché principal de VLC' },
      { clave: 'live-caching',           motor: 'vlc',   unidad: 'ms', nota: 'caché para fuentes en directo' },
      { clave: 'file-caching',           motor: 'vlc',   unidad: 'ms', nota: 'caché de fichero/local' },
      { clave: 'sout-mux-caching',       motor: 'vlc',   unidad: 'ms', nota: 'mux de salida' },
      { clave: 'network_caching_ms',     motor: 'actor', unidad: 'ms', nota: 'inyección del actor de player' },
      { clave: 'networkCachingMs',       motor: 'lab',   unidad: 'ms', nota: 'declaración del LAB' }
    ],
    duplicados: [
      { clave: 'network-caching', motivo: 'aparece en vlcopt y en player_enslavement.L3; sólo L3 se emite' }
    ]
  },
  {
    id: 'buffer_tiempo',
    magnitud: 'el mismo colchón expresado en segundos',
    unidad: 's',
    valor_canonico: 15,
    homologos: [
      { clave: 'buffer_seconds',  motor: 'lab',     unidad: 's', nota: 'knob del solver; el generador lo multiplica por 1000' },
      { clave: 'bufferSeconds',   motor: 'lab',     unidad: 's', nota: 'declaración; hoy muerta' }
    ],
    duplicados: [],
    nota: 'buffer_seconds x1000 debe dar exactamente valor_canonico de cache_red'
  },
  {
    id: 'reintentos_http',
    magnitud: 'cuántas veces se reintenta antes de rendirse',
    unidad: 'count',
    valor_canonico: 350,
    homologos: [
      { clave: 'http-max-retries',         motor: 'vlc',     unidad: 'count', nota: 'reintentos HTTP de VLC' },
      { clave: 'network-reconnect-count',  motor: 'vlc',     unidad: 'count', nota: 'reconexiones de red' },
      { clave: 'reconnect_attempts',       motor: 'knob',    unidad: 'count', nota: 'knob del solver' }
    ],
    duplicados: []
  },
  {
    id: 'timeout_http',
    magnitud: 'espera máxima por respuesta',
    unidad: 'ms',
    valor_canonico: 30000,
    homologos: [
      { clave: 'http-timeout', motor: 'vlc', unidad: 'ms', nota: 'timeout de VLC' }
    ],
    duplicados: []
  },
  {
    id: 'abr_factor',
    magnitud: 'fracción de ancho de banda exigida para subir de nivel',
    unidad: 'ratio',
    valor_canonico: 0.85,
    homologos: [
      { clave: 'abrBandWidthFactor',  motor: 'hls.js',   unidad: 'ratio', nota: 'ratio 0..1' },
      { clave: 'abr_bw_factor',       motor: 'bounds',   unidad: 'ratio', nota: 'límite declarado' }
    ],
    duplicados: [
      { clave: 'abrBandWidthFactor', motivo: 'declarado en hlsjs (95, inválido), optimized_knobs (0.85) y actor.exoplayer (0.85)' }
    ]
  },
  {
    id: 'livesync_rate',
    magnitud: 'velocidad de reproducción para alcanzar el directo',
    unidad: 'ratio',
    valor_canonico: 1.25,
    homologos: [
      { clave: 'maxLiveSyncPlaybackRate', motor: 'hls.js', unidad: 'ratio', nota: '1.0 = tiempo real; >1 acelera' }
    ],
    duplicados: [
      { clave: 'maxLiveSyncPlaybackRate', motivo: 'declarado en settings, hlsjs, optimized_knobs y dos actores' }
    ]
  },
  // CUIDADO, y esto lo aprendi equivocandome: maxBufferLength y maxMaxBufferLength tienen nombres
  // distintos Y magnitudes distintas (objetivo y techo). NO son homologos. Meterlos en una familia con
  // un solo canonico habria pedido techo 105 cuando el objetivo ya es 105 — incoherencia creada por mi.
  // Cada uno es su propia familia; lo que comparten es que estan declarados en dos capas.
  {
    id: 'max_buffer_length',
    magnitud: 'buffer objetivo de hls.js',
    unidad: 'count',
    tipo: 'unico',
    valor_canonico: 105,
    homologos: [{ clave: 'maxBufferLength', motor: 'hls.js', unidad: 'count', nota: 'segundos objetivo' }],
    duplicados: [{ clave: 'maxBufferLength', motivo: 'declarado en hlsjs (50, muerto) y actor.hlsjs (105, emitido)' }]
  },
  {
    id: 'max_max_buffer_length',
    magnitud: 'techo del buffer de hls.js',
    unidad: 'count',
    tipo: 'unico',
    valor_canonico: 210,
    homologos: [{ clave: 'maxMaxBufferLength', motor: 'hls.js', unidad: 'count', nota: 'techo; debe ser > maxBufferLength' }],
    duplicados: [{ clave: 'maxMaxBufferLength', motivo: 'declarado en hlsjs (50, muerto) y actor.hlsjs (210, emitido)' }]
  },
  {
    id: 'nudge_offset',
    magnitud: 'desplazamiento por corrección de desfase',
    unidad: 'ratio',
    tipo: 'unico',
    valor_canonico: 0.1,
    homologos: [{ clave: 'nudgeOffset', motor: 'hls.js', unidad: 'ratio', nota: 'segundos' }],
    duplicados: [{ clave: 'nudgeOffset', motivo: 'declarado en hlsjs (1, muerto) y actor.hlsjs (0.1, emitido)' }]
  },
  {
    id: 'nudge_max_retry',
    magnitud: 'número máximo de correcciones de desfase',
    unidad: 'count',
    tipo: 'unico',
    valor_canonico: 13,
    homologos: [{ clave: 'nudgeMaxRetry', motor: 'hls.js', unidad: 'count', nota: 'default hls.js = 3; el LAB usa 13' }],
    duplicados: [{ clave: 'nudgeMaxRetry', motivo: 'declarado en hlsjs, optimized_knobs y dos actores' }]
  },
  {
    id: 'watchdog',
    magnitud: 'periodo del vigilante de buffer alto',
    unidad: 'ratio',
    valor_canonico: 3,
    homologos: [
      { clave: 'highBufferWatchdogPeriod', motor: 'hls.js', unidad: 'count', nota: 'segundos' }
    ],
    duplicados: [{ clave: 'highBufferWatchdogPeriod', motivo: 'hlsjs (1) vs actor.hlsjs (3)' }]
  },
  {
    id: 'frag_tolerance',
    magnitud: 'tolerancia al buscar fragmento',
    unidad: 'ratio',
    valor_canonico: 0.25,
    homologos: [
      { clave: 'maxFragLookUpTolerance', motor: 'hls.js', unidad: 'ratio', nota: 'segundos' }
    ],
    duplicados: [{ clave: 'maxFragLookUpTolerance', motivo: 'hlsjs (25) vs actor.hlsjs (0.25)' }]
  },
  {
    id: 'luminancia_hdr',
    magnitud: 'pico de luminancia declarado al panel',
    unidad: 'nits',
    valor_canonico: 4000,
    homologos: [
      { clave: 'peak_luminance_nits', motor: 'panel', unidad: 'nits', nota: 'atributo X-HDR-PEAK-LUMINANCE' },
      { clave: 'peakLuminanceNits',   motor: 'lab',   unidad: 'nits', nota: 'declaración; hoy muerta' }
    ],
    duplicados: [{ clave: 'peak_luminance_nits', motivo: 'declarado en settings x2 y actor.panel' }]
  },
  {
    id: 'prefetch',
    magnitud: 'segmentos precargados',
    unidad: 'count',
    valor_canonico: 12,
    homologos: [
      { clave: 'prefetch_segments',  motor: 'prefetch', unidad: 'count', nota: 'el que se lee (L1634)' },
      { clave: 'prefetchSegments',   motor: 'lab',      unidad: 'count', nota: 'declaración; hoy muerta' }
    ],
    duplicados: []
  },
  {
    id: 'privacidad',
    magnitud: 'cabecera Do-Not-Track',
    unidad: 'bool',
    valor_canonico: 1,
    homologos: [
      { clave: 'DNT', motor: 'exthttp', unidad: 'bool', nota: 'cabecera HTTP' }
    ],
    duplicados: [{ clave: 'DNT', motivo: 'headers (0) vs player_enslavement.L3.EXTHTTP (1)' }]
  }
];

// Discrepancias INTENCIONALES: no son contradicciones y no se tocan.
const LEGITIMOS = [
  {
    clave: 'pq_ai_dnr_enable',
    motivo: 'global 1 y 0 en content_overrides.deportes: apagar DNR en deportes es una decisión de contenido, no un conflicto',
    valor_global: 1,
    overrides: { deportes: 0 }
  },
  {
    clave: 'pq_dnr_enable',
    motivo: 'idem',
    valor_global: 1,
    overrides: { deportes: 0 }
  }
];

/** Convierte un valor a la unidad de la familia. Devuelve null si no es numérico. */
function aUnidad(valor, desde, hacia) {
  const n = Number(valor);
  if (!isFinite(n)) return null;
  if (desde === hacia) return n;
  if (desde === 's' && hacia === 'ms') return n * 1000;
  if (desde === 'ms' && hacia === 's') return n / 1000;
  return n;
}

module.exports = { FAMILIAS, LEGITIMOS, aUnidad };

// Ejecutado directo: imprime el mapa y los pares que HOY estarian en desacuerdo.
if (require.main === module) {
  const pad = (s, n) => String(s).padEnd(n);
  let totalHomologos = 0;
  let totalDuplicados = 0;
  for (const f of FAMILIAS) {
    const can = f.valor_canonico;
    const enMs = f.unidad === 'ms' ? can : (f.unidad === 's' ? can * 1000 : can);
    console.log(`\n${f.id}  [${f.unidad}]  canonico = ${can}${f.unidad === 's' ? `  (= ${enMs} ms)` : ''}`);
    console.log(`  ${f.magnitud}`);
    for (const h of f.homologos) {
      totalHomologos++;
      const equival = aUnidad(can, f.unidad, h.unidad);
      console.log(`    DEJAR      ${pad(h.clave, 26)} ${pad(h.motor, 10)} valor exigido = ${equival}`);
    }
    for (const d of f.duplicados || []) {
      totalDuplicados++;
      console.log(`    QUITAR 1   ${pad(d.clave, 26)} ${d.motivo}`);
    }
  }
  console.log(`\nFAMILIAS=${FAMILIAS.length}  HOMOLOGOS=${totalHomologos}  DUPLICADOS_EXACTOS=${totalDuplicados}  LEGITIMOS=${LEGITIMOS.length}`);
}
