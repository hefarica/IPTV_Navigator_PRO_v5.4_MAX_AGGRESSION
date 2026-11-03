#!/usr/bin/env node
/**
 * lab_metadata_decode.js — reensambla y valida la metadata chunked `#EXT-X-APE-LAB-METADATA:i/n:<base64>`
 * que la lista lleva en produccion, y **se niega a aceptar que declare cosas que el manifiesto contradice**.
 *
 * Por que existe: el operador pide que el JSON de laboratorio llegue dinamico al manifiesto. Ese canal ya
 * funciona en la lista de referencia —20 chunks, JSON valido— y hay que poder reproducirlo y auditarlo.
 * Pero un manifiesto tambien puede MENTIR en ese JSON, y esa mentira no la ve nadie porque el tag es
 * inerte: los reproductores lo ignoran (RFC 8216 6.3.1). Este tool lo lee y lo contrasta.
 *
 * Las reglas duras salen de la auditoria de esta sesion, no de la imaginacion:
 *   C1  audio_throughpass:true exige #EXT-X-MEDIA con TYPE=AUDIO > 0. En esta lista son 0.
 *   C2  demuxed:true exige #EXT-X-MEDIA o #EXT-X-MAP. En esta lista son 0 y 0.
 *   C3  video_upscale_only:true exige al menos un escalador en alguna cadena de filtros. Aqui: ninguno.
 *   C4  los n de los chunks deben ser 1..N sin huecos ni repetidos, y la suma debe ser JSON valido.
 *
 * Uso:
 *   node tools/ape-parse-defects/lab_metadata_decode.js <lista.m3u8> [--json salida.json] [--volcar]
 * Contrato: 0 = metadata coherente · 4 = contradiccion declarada · 5 = no hay metadata · 3 = ilegible
 */
'use strict';

const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const entrada = args.find((a) => !a.startsWith('--'));
const salida = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const volcar = args.includes('--volcar');

if (!entrada || !fs.existsSync(entrada)) {
  process.stderr.write('ERROR: falta la lista o no existe\n');
  process.exit(3);
}

const RE_CHUNK = /^#EXT-X-APE-LAB-METADATA:(\d+)\/(\d+):(.+)$/;

(async () => {
  const chunks = new Map();
  const declarado = new Map();
  let mediaAudio = 0;
  let map = 0;
  let cadenas = 0;
  let conEscalador = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(entrada, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const cruda of rl) {
    const l = cruda.trim();
    if (!l) continue;
    const m = RE_CHUNK.exec(l);
    if (m) {
      const i = Number(m[1]);
      const n = Number(m[2]);
      if (!declarado.has(i)) declarado.set(i, n);
      if (!chunks.has(i)) chunks.set(i, m[3]);
      continue;
    }
    if (/^#EXT-X-MEDIA:/.test(l) && /TYPE=AUDIO/i.test(l)) mediaAudio++;
    if (/^#EXT-X-MAP:/.test(l)) map++;
    const f = /video-filter=/.exec(l);
    if (f) {
      cadenas++;
      // Un escalador real cambia de tamano: zscale/scale con w= y h=, o un filtro de escala explicito.
      if (/(^|,)(z)?scale=[^,]*w=\d+/.test(l) || /(^|,)scale=[^,]*=.*\d+x\d+/.test(l)) conEscalador++;
    }
  }

  const base = {
    fichero: entrada,
    chunks_declarados: declarado.size,
    media_audio: mediaAudio,
    ext_x_map: map,
    cadenas_video_filter: cadenas,
    cadenas_con_escalador: conEscalador
  };

  if (chunks.size === 0) {
    process.stderr.write('SIN METADATA: la lista no lleva #EXT-X-APE-LAB-METADATA\n');
    process.stdout.write(JSON.stringify({ ...base, estado: 'SIN_METADATA' }, null, 2) + '\n');
    process.exit(5);
  }

  // C4 · integridad de la numeracion
  const idx = [...chunks.keys()].sort((a, b) => a - b);
  const nDecl = declarado.get(idx[0]);
  const problemas = [];
  if (nDecl !== chunks.size) {
    problemas.push(`C4: se declaran ${nDecl} chunks y hay ${chunks.size}`);
  }
  for (let i = 1; i <= nDecl; i++) {
    if (!chunks.has(i)) problemas.push(`C4: falta el chunk ${i}/${nDecl}`);
  }
  const b64 = idx.map((i) => chunks.get(i)).join('');
  let texto = null;
  let json = null;
  try {
    texto = Buffer.from(b64, 'base64').toString('utf8');
    json = JSON.parse(texto);
  } catch (e) {
    problemas.push(`C4: la concatenacion no es JSON valido (${e.message})`);
  }

  // C1..C6 · validacion contra el ESQUEMA REAL.
  //
  // La primera version de este checker buscaba claves como audio_throughpass y demed: dio COHERENTE
  // sobre una lista con 74.011 contradicciones, porque esas claves NO EXISTEN en el esquema que la
  // lista usa de verdad. Un checker que aprueba por no encontrar el campo es peor que no tener checker.
  // Las reglas de abajo se escribieron mirando el JSON real: {schema, profile, generated_at, fields},
  // y dentro de fields: vlcopt, kodiprop, hlsjs, settings, quality_levels, bounds, optimized_knobs.
  let decisionTabla = null;
  if (json) {
    const f = (json.fields && typeof json.fields === 'object') ? json.fields : {};
    decisionTabla = tablaDecision(f);
    const num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null));

    // C1 · hls.js: abrBandWidthFactor y abrBandWidthUpFactor son RATIOS 0..1 en hls.js.
    // La lista los emite como 95 y 7. Un upFactor de 7 deja pasar niveles diez veces mas grandes de
    // lo que la banda aguanta: no es "mas agresivo", es rebuffering garantizado.
    const h = (f.hlsjs && typeof f.hlsjs === 'object') ? f.hlsjs : null;
    if (h) {
      for (const k of ['abrBandWidthFactor', 'abrBandWidthUpFactor']) {
        if (!(k in h)) continue;
        const v = num(h[k]);
        if (v === null) { problemas.push(`C1: hlsjs.${k} no es numerico (${JSON.stringify(h[k])})`); continue; }
        if (v > 1) {
          problemas.push(
            `C1: hlsjs.${k}=${v} fuera del rango de hls.js (ratio 0..1). ` +
            `El valor correcto seria ${(v / 100).toFixed(2)} si la intencion era un porcentaje.`
          );
        }
      }
    }

    // C2 · passthrough de audio declarado con cero renditions de audio.
    const kp = (f.kodiprop && typeof f.kodiprop === 'object') ? f.kodiprop : {};
    const apKey = Object.keys(kp).find((k) => /audio_passthrough/i.test(k));
    if (apKey && mediaAudio === 0) {
      problemas.push(
        `C2: kodiprop.${apKey}=${kp[apKey]} pero #EXT-X-MEDIA TYPE=AUDIO = ${mediaAudio}. ` +
        `El player no puede pasar por alto un audio que el manifiesto no separa.`
      );
    }

    // C3 · la escalera declara una resolucion sin fuente que la sostenga.
    const ql = (f.quality_levels && typeof f.quality_levels === 'object') ? f.quality_levels : {};
    const res = (o) => {
      const m = /(\d+)x(\d+)/.exec(String(o && o.resolution ? o.resolution : ''));
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    const l1 = ql.L1 || ql.l1;
    const r1 = l1 ? res(l1) : null;
    if (r1 && r1[0] >= 7680) {
      problemas.push(
        `C3: quality_levels.L1 declara ${r1[0]}x${r1[1]} y ninguna de las ${cadenas} cadenas lleva ` +
        `escalador que pueda alcanzarla.`
      );
    }

    // C4 · settings.resolution contra la escalera. Si no coinciden, el metadata se contradice solo.
    const s = (f.settings && typeof f.settings === 'object') ? f.settings : {};
    const rs = res(s);
    if (rs && r1 && (rs[0] !== r1[0] || rs[1] !== r1[1])) {
      problemas.push(`C4: settings.resolution=${rs[0]}x${rs[1]} y quality_levels.L1=${r1[0]}x${r1[1]}`);
    }

    // C5 · knob calibrado fuera de su propio limite declarado.
    //
    // TERCER falso negativo de este checker, y el mas instructivo: bounds y optimized_knobs no
    // comparten NI UNA clave. Usan nombres distintos para lo mismo (buffer vs buffer_seconds,
    // abr_bw_factor vs abrBandWidthFactor). Comparar por igualdad de nombre da 0 parejas y el bucle
    // no itera: aprueba sin haber mirado nada. Hace falta una tabla de equivalencia explicita, y
    // ademas una guarda que grite cuando la tabla cubre cero claves.
    const b = (f.bounds && typeof f.bounds === 'object') ? f.bounds : {};
    const ok = (f.optimized_knobs && typeof f.optimized_knobs === 'object') ? f.optimized_knobs : {};
    const EQUIV = {
      buffer: 'buffer_seconds',
      abr_bw_factor: 'abrBandWidthFactor',
      reconnect: 'reconnect_attempts',
      live_sync: 'maxLiveSyncPlaybackRate',
      live_delay: 'live_delay_seconds',
      nudge_retry: 'nudgeMaxRetry',
      frag_retry: 'fragLoad_maxNumRetry'
    };
    let parejas = 0;
    for (const kb of Object.keys(b)) {
      const lim = b[kb];
      if (!Array.isArray(lim) || lim.length < 2) continue;
      const nombreKnob = kb in ok ? kb : EQUIV[kb];
      if (!nombreKnob || !(nombreKnob in ok)) continue;
      parejas++;
      const v = num(ok[nombreKnob]);
      const lo = num(lim[0]);
      const hi = num(lim[1]);
      if (v === null || lo === null || hi === null) continue;
      if (v < lo || v > hi) {
        problemas.push(`C5: optimized_knobs.${nombreKnob}=${v} fuera de bounds.${kb}=[${lo},${hi}]`);
      }
    }
    // C6 · la guarda que impide que C5 apruebe por vacio.
    if (Object.keys(b).length > 0 && parejas === 0) {
      problemas.push(
        `C6: bounds y optimized_knobs no comparten ninguna clave reconocible (${Object.keys(b).length} bounds, ` +
        `${Object.keys(ok).length} knobs, 0 parejas). La comprobacion de limites NO se pudo hacer.`
      );
    }

    // C7 · el mismo parametro declarado dos veces con valores distintos en el mismo metadata.
    const vistas = new Map();
    const recorrer = (obj, ruta) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) { recorrer(v, `${ruta}.${k}`); continue; }
        const n = num(v);
        if (n === null) continue;
        const clave = k.toLowerCase().replace(/[._-]/g, '');
        if (!vistas.has(clave)) vistas.set(clave, []);
        vistas.get(clave).push({ ruta: `${ruta}.${k}`, valor: n });
      }
    };
    recorrer(f, 'fields');
    // FALSO POSITIVO propio, corregido aqui: una escalera por niveles (quality_levels.L1..L7) tiene
    // bitrates distintos A PROPOSITO. Eso no es una contradiccion. Se excluyen las rutas que pasan por
    // un contenedor de nivel antes de contar.
    const esEscalera = (ruta) => /quality_levels\.[Ll]\d+\./.test(ruta);
    for (const [clave, lista] of vistas) {
      const efectivos = lista.filter((x) => !esEscalera(x.ruta));
      const valores = [...new Set(efectivos.map((x) => x.valor))];
      if (efectivos.length > 1 && valores.length > 1) {
        problemas.push(
          `C7: '${clave}' declarado ${efectivos.length} veces con valores distintos: ` +
          efectivos.map((x) => `${x.ruta}=${x.valor}`).join(' vs ')
        );
      }
    }
  }

  const informe = {
    ...base,
    chunks_reconstruidos: chunks.size,
    declarados_por_el_tag: nDecl,
    base64_chars: b64.length,
    json_chars: texto ? texto.length : 0,
    esquema: json && json.schema ? json.schema : null,
    perfil: json && json.profile ? json.profile : null,
    claves: json ? Object.keys(json) : [],
    problemas,
    decision: decisionTabla,
    homologacion: decisionTabla ? verificarHomologacion((json.fields && typeof json.fields === 'object') ? json.fields : {}) : null,
    estado: problemas.length ? 'CONTRADICHO' : 'COHERENTE'
  };

  if (volcar && texto) informe.json = json;
  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 2) + '\n');

  process.stderr.write(
    `  ${chunks.size}/${nDecl} chunks · ${texto ? texto.length : 0} chars de JSON · esquema ` +
    `${informe.esquema || '(sin declarar)'} · perfil ${informe.perfil || '-'}\n` +
    `  #EXT-X-MEDIA audio=${mediaAudio} · #EXT-X-MAP=${map} · cadenas=${cadenas} · con escalador=${conEscalador}\n`
  );
  for (const p of problemas) process.stderr.write(`  CONTRADICCION ${p}\n`);
  process.exit(problemas.length ? 4 : 0);
})().catch((e) => {
  process.stderr.write(`ERROR: ${e.message}\n`);
  process.exit(3);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DECISION DE LOS 22 DUPLICADOS
//
// El generador aplica 10 capas en orden y todas usan upsert: gana la ULTIMA que declara el parametro.
// Esta seccion reconstruye ese valor emitido sin ejecutar el generador, y lo compara con el optimo
// declarado aqui. Asi la decision no vive en un documento que nadie relee: se recalcula en cada push.
//
// Referencias de los optimos:
//   - 15000 ms de cache: el valor que el propio LAB escribe en vlcopt y que APE_PROFILE_MATRIX usa en P4/P5.
//     105000 ms son 105 s de latencia respecto al directo.
//   - hls.js: abrBandWidthFactor 0.85 (conservador, evita rebuffer), maxFragLookUpTolerance 0.25 (default),
//     nudgeOffset 0.1 (default), maxLiveSyncPlaybackRate 1.25 (< 1.5 default, conservador).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Fusiona varios sub-objetos de una misma capa. El generador hace upsert de EXTVLCOPT, KODIPROP,
// EXTHTTP y SYS por separado en L10720-10723; mirar solo EXTVLCOPT dejaba DNT sin detectar.
const fusion = (base, subs) => (f) => {
  const raiz = base(f);
  if (!raiz || typeof raiz !== 'object') return null;
  const out = {};
  for (const s of subs) {
    const o = raiz[s];
    if (o && typeof o === 'object') Object.assign(out, o);
  }
  return out;
};
const L3 = (f) => f.player_enslavement && f.player_enslavement.level_3_per_channel;

const CAPAS_ORDEN = [
  ['optimized_knobs',        (f) => f.optimized_knobs],
  ['headers',                (f) => f.headers],
  ['prefetch_config',        (f) => f.prefetch_config],
  ['player_enslavement.L3',  fusion(L3, ['EXTVLCOPT', 'KODIPROP', 'EXTHTTP', 'SYS'])],
  ['actor.player.exoplayer', (f) => f.actor_injections && f.actor_injections.player && f.actor_injections.player.exoplayer],
  ['actor.player.hlsjs',     (f) => f.actor_injections && f.actor_injections.player && f.actor_injections.player.hlsjs],
  ['actor.panel',            (f) => f.actor_injections && f.actor_injections.panel],
  ['actor.player.kodi',      (f) => f.actor_injections && f.actor_injections.player && f.actor_injections.player.kodi],
  ['actor.os',               (f) => f.actor_injections && f.actor_injections.os],
  ['actor.network',          (f) => f.actor_injections && f.actor_injections.network],
  ['actor.iptv_server',      (f) => f.actor_injections && f.actor_injections.iptv_server],
  ['actor.soc_vpp_dnr',      fusion((f) => f.actor_injections && f.actor_injections.soc_vpp_dnr, ['settings', 'content_overrides'])],
  ['actor.player.vlc',       (f) => f.actor_injections && f.actor_injections.player && f.actor_injections.player.vlc]
];

// Cada entrada: nombres aceptados por capa (se normalizan quitando _ . -), optimo y nota.
const DECISION = [
  { p: 'network-caching',        alias: ['networkcaching', 'networkcachingms'], opt: 15000, nota: '105 s de latencia en directo' },
  { p: 'live-caching',           alias: ['livecaching'],                        opt: 15000, nota: 'idem' },
  { p: 'file-caching',           alias: ['filecaching'],                        opt: 20000, nota: 'idem' },
  { p: 'sout-mux-caching',       alias: ['soutmuxcaching'],                     opt: 20000, nota: 'idem' },
  { p: 'buffer_seconds',         alias: ['bufferseconds'],                      opt: 15,    nota: 'KNOB: no se emite; alimenta network-caching x1000' },
  { p: 'http-max-retries',       alias: ['httpmaxretries', 'reconnectattempts'],opt: 350,   nota: 'anti-freeze, correcto' },
  { p: 'http-timeout',           alias: ['httptimeout'],                        opt: 30000, nota: 'correcto' },
  { p: 'network-reconnect-count',alias: ['networkreconnectcount'],              opt: 350,   nota: 'correcto' },
  { p: 'abrBandWidthFactor',     alias: ['abrbandwidthfactor'],                 opt: 0.85,  nota: 'ratio 0..1, correcto' },
  { p: 'maxLiveSyncPlaybackRate',alias: ['maxlivesyncplaybackrate'],            opt: 1.25,  nota: 'correcto' },
  { p: 'maxFragLookUpTolerance', alias: ['maxfraglookuptolerance'],             opt: 0.25,  nota: 'correcto' },
  { p: 'nudgeOffset',            alias: ['nudgeoffset'],                        opt: 0.1,   nota: 'correcto' },
  { p: 'nudgeMaxRetry',          alias: ['nudgemaxretry'],                      opt: 13,    nota: 'correcto' },
  { p: 'highBufferWatchdogPeriod',alias:['highbufferwatchdogperiod'],           opt: 3,     nota: 'correcto' },
  { p: 'maxBufferLength',        alias: ['maxbufferlength'],                    opt: 105,   nota: 'correcto' },
  { p: 'maxMaxBufferLength',     alias: ['maxmaxbufferlength'],                 opt: 210,   nota: 'correcto' },
  { p: 'peak_luminance_nits',    alias: ['peakluminancenits'],                  opt: 4000,  nota: 'rango HDR habitual' },
  { p: 'prefetch_segments',      alias: ['prefetchsegments'],                   opt: 12,    nota: 'leido de prefetch_config' },
  { p: 'DNT',                    alias: ['dnt'],                                opt: 1,     nota: 'no rastrear' },
  { p: 'pq_ai_dnr_enable',       alias: ['pqaidnrenable'],                      opt: 1,     nota: 'global 1; override deportes 0 es legitimo' },
  { p: 'pq_dnr_enable',          alias: ['pqdnrenable'],                        opt: 1,     nota: 'idem' }
];

const norm = (k) => String(k).toLowerCase().replace(/[._-]/g, '');

/** Reconstruye el valor que el generador EMITE: la ultima capa que declare el parametro. */
function valorEmitido(fields, item) {
  const buscados = [norm(item.p), ...item.alias].map(norm);
  let ganador = null;
  for (const [capaId, get] of CAPAS_ORDEN) {
    const obj = get(fields);
    if (!obj || typeof obj !== 'object') continue;
    for (const k of Object.keys(obj)) {
      if (!buscados.includes(norm(k))) continue;
      const v = obj[k];
      if (v && typeof v === 'object') continue;
      ganador = { capa: capaId, clave: k, valor: v };
    }
  }
  return ganador;
}

function tablaDecision(fields) {
  return DECISION.map((item) => {
    const g = valorEmitido(fields, item);
    const emitido = g ? (isNaN(Number(g.valor)) ? g.valor : Number(g.valor)) : null;
    const difiere = emitido !== null && item.opt !== null && Number(emitido) !== Number(item.opt);
    return {
      parametro: item.p,
      emitido,
      capa_que_gana: g ? g.capa : '(ninguna)',
      clave_emisora: g ? g.clave : '(ninguna)',
      optimo: item.opt,
      difiere,
      nota: item.nota,
      accion: emitido === null ? 'NO_EMITIDO' : (difiere ? 'CORREGIR' : 'DEJAR')
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HOMOLOGACION: el mismo valor dicho en el idioma de cada motor
//
// Regla del operador: los campos con el MISMO nombre son duplicados y sobra uno; los que NO se llaman
// igual pero miden lo mismo son homologos y deben llevar el MISMO valor, para que la config llegue a
// todos lados sin que un motor reciba una verdad y otro otra.
//
// Esto recorre TODO el objeto fields (no solo las capas vivas), recoge cada ocurrencia de cada clave de
// cada familia, y exige que el valor convertido a la unidad de la familia sea el canonico. Distingue
// ocurrencia VIVA (en una capa que el generador emite) de MUERTA (en settings/hlsjs, que no se leen):
// las muertas no rompen nada hoy, pero se reportan porque son la mentira de manana.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const { FAMILIAS, LEGITIMOS, aUnidad } = require('./homologacion');

const CAPAS_VIVAS = ['optimized_knobs', 'headers', 'prefetch_config', 'player_enslavement',
  'actor_injections', 'vlcopt', 'kodiprop'];
const CAPAS_MUERTAS = ['settings', 'hlsjs'];

/** Recorre fields y devuelve [{ruta, valor, viva}] para cada clave normalizada buscada. */
function ocurrencias(fields, buscadas) {
  const out = [];
  const walk = (obj, ruta, viva) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const r = ruta ? `${ruta}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v, r, viva); continue; }
      // Un ARRAY no es un valor escalar: bounds.abr_bw_factor=[0.85,0.98] es un rango y
      // headerOverrides.DNT=[1,0,0,0] son valores por perfil. Compararlos como escalares fue falso positivo mio.
      if (Array.isArray(v)) continue;
      // headerOverrides guarda valores POR PERFIL serializados ('1,0,0,0'); no es un escalar.
      if (typeof v === 'string' && v.includes(',')) continue;
      if (!buscadas.includes(norm(k))) continue;
      out.push({ ruta: r, valor: v, viva });
    }
  };
  const topViva = (k) => CAPAS_VIVAS.includes(k);
  const topMuerta = (k) => CAPAS_MUERTAS.includes(k);
  for (const k of Object.keys(fields)) {
    const esViva = topViva(k);
    const esMuerta = topMuerta(k);
    const v = fields[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, k, esViva || !esMuerta);
  }
  return out;
}

function verificarHomologacion(fields) {
  const familias = [];
  for (const fam of FAMILIAS) {
    const claves = fam.homologos.map((h) => norm(h.clave));
    const ocur = ocurrencias(fields, claves);
    const filas = ocur.map((o) => {
      const valor = Number(o.valor);
      const convertido = isFinite(valor) ? aUnidad(valor, fam.unidad, fam.unidad) : null;
      return {
        ruta: o.ruta,
        valor_original: o.valor,
        valor: convertido,
        viva: o.viva,
        cumple: convertido !== null && Number(convertido) === Number(fam.valor_canonico)
      };
    });
    const vivas = filas.filter((f) => f.viva);
    const vivasMal = vivas.filter((f) => !f.cumple);
    const muertasMal = filas.filter((f) => !f.viva && !f.cumple);
    familias.push({
      id: fam.id,
      canonico: fam.valor_canonico,
      unidad: fam.unidad,
      ocurrencias: filas.length,
      vivas: vivas.length,
      vivas_en_desacuerdo: vivasMal.map((f) => `${f.ruta}=${f.valor_original}`),
      muertas_en_desacuerdo: muertasMal.map((f) => `${f.ruta}=${f.valor_original}`),
      estado: vivasMal.length ? 'ROTO' : (muertasMal.length ? 'SINCRONIZAR_MUERTAS' : 'OK')
    });
  }
  const rotas = familias.filter((f) => f.estado === 'ROTO');
  const despistadas = familias.filter((f) => f.estado === 'SINCRONIZAR_MUERTAS');
  return {
    familias,
    resumen: {
      familias: familias.length,
      rotas: rotas.length,
      solo_muertas: despistadas.length,
      ok: familias.filter((f) => f.estado === 'OK').length,
      legitimas: LEGITIMOS.length
    }
  };
}
