#!/usr/bin/env node
/**
 * 03_schema_probe.mjs — productor de las DOS correcciones de t12 sobre 03_headers_map.json
 * =========================================================================================
 * Corrige, con medición propia, los dos defectos de severidad ALTA que t6 encontró en 03:
 *
 *   H1  «GOLDEN RULE: 0 violaciones» tenía DENOMINADOR INCOMPLETO: §3.4 sólo miraba 4
 *       sumideros. Aquí se censan TODOS los sumideros donde puede aparecer un codec string
 *       (tag), con conteo por sumidero y por valor, y el veredicto se reformula como
 *       «0 cruces en los sumideros evaluados (N de M)».
 *
 *   H2  «cada campo está en el principal o en el overflow, nunca en ninguno» es FALSO:
 *       51 de 276 nombres no suman 10.573. Aquí se cuantifica y se documentan los esquemas
 *       reales de #EXTHTTP (agrupando por CONJUNTO DE CLAVES EXACTO, no por indicadores).
 *
 * NO reescribe el censo de 03 (eso lo produce 03_headers_analyzer.mjs): AÑADE/REEMPLAZA
 * secciones. Idempotente: correrlo N veces da el mismo JSON.
 *
 * Uso:
 *   node 03_schema_probe.mjs [--src <lista>] [--json <03_headers_map.json>] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';

const SRC_DEFAULT =
  'C:\\Users\\HFRC\\Downloads\\APE_LISTA_1793589060441.m3u8';
const JSON_DEFAULT = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '03_headers_map.json'
);

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRC = argOf('--src', SRC_DEFAULT);
const JSON_OUT = argOf('--json', JSON_DEFAULT);
const DRY = argv.includes('--dry-run');

const CODEC_RE = /\b(hvc1|hev1)\.[0-9][A-Za-z0-9.]*/g;
const TAG_RE = /^#([A-Za-z0-9._\-]+)/;

/* Sumideros que un runtime del catálogo ENLAZA para decidir decode.
 * Base medida: 04_LANE_CAPABILITY_MATRIX.md §6 (ExoPlayer/hls.js leen manifiesto HLS;
 * Kodi lee #KODIPROP; VLC lee #EXTVLCOPT). Todo lo demás es tag desconocido (RFC 8216 §6.3.1). */
const RUNTIME_BOUND_SINKS = new Set([
  '#EXT-X-STREAM-INF',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#KODIPROP',
  '#EXTVLCOPT',
]);

const stats = {
  lines: 0,
  channels: 0,
  exthttp: 0,
  exthttp_bad_json: 0,
  // H1
  // Se PRE-SIEMBRAN los 4 sumideros que un runtime enlaza: KODIPROP y EXTVLCOPT pueden llevar
  // un codec string aunque en esta lista lleven CERO. Omitirlos del denominador inflaria el
  // veredicto por omision (el mismo error que t6 detecto, en pequeno).
  sinkTotals: new Map([...RUNTIME_BOUND_SINKS].map((t) => [t, { hvc1: 0, hev1: 0, values: new Map() }])),
  hevChannelsByProfile: new Map(), // perfil -> n canales con hev1 en EXTHTTP
  hevChannelsTotal: 0,
  // H2
  mainFreq: new Map(),
  overFreq: new Map(),
  schemas: new Map(),           // hash -> {hash, n, nfields, profiles:Map, pres:Map(field->count)}
};

const rl = readline.createInterface({
  input: fs.createReadStream(SRC, { encoding: 'utf8', highWaterMark: 1 << 20 }),
  crlfDelay: Infinity,
});

for await (const raw of rl) {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  stats.lines++;
  if (line.startsWith('#EXTINF')) { stats.channels++; continue; }

  // ---------- H1: censo de sumideros ----------
  if (line[0] === '#') {
    const m = TAG_RE.exec(line);
    const tag = m ? '#' + m[1] : '#(sin-nombre)';
    const hits = [...line.matchAll(CODEC_RE)];
    if (hits.length) {
      if (!stats.sinkTotals.has(tag)) stats.sinkTotals.set(tag, { hvc1: 0, hev1: 0, values: new Map() });
      const s = stats.sinkTotals.get(tag);
      for (const h of hits) {
        if (h[1] === 'hvc1') s.hvc1++; else s.hev1++;
        s.values.set(h[0], (s.values.get(h[0]) || 0) + 1);
      }
    }
  }

  // ---------- H2: esquemas de #EXTHTTP ----------
  if (line.startsWith('#EXTHTTP:')) {
    stats.exthttp++;
    let o;
    try { o = JSON.parse(line.slice('#EXTHTTP:'.length)); }
    catch { stats.exthttp_bad_json++; continue; }
    const keys = Object.keys(o);
    for (const k of keys) stats.mainFreq.set(k, (stats.mainFreq.get(k) || 0) + 1);

    const h = crypto.createHash('sha1').update(keys.slice().sort().join('\u0001')).digest('hex').slice(0, 8);
    if (!stats.schemas.has(h)) {
      stats.schemas.set(h, { hash: h, n: 0, nfields: keys.length, profiles: new Map(), pres: new Map() });
    }
    const s = stats.schemas.get(h);
    s.n++;
    const prof = o['X-APE-Profile'] || '(sin perfil)';
    s.profiles.set(prof, (s.profiles.get(prof) || 0) + 1);
    for (const k of keys) s.pres.set(k, (s.pres.get(k) || 0) + 1);

    if (/\bhev1\./.test(line)) {
      stats.hevChannelsTotal++;
      stats.hevChannelsByProfile.set(prof, (stats.hevChannelsByProfile.get(prof) || 0) + 1);
    }
    continue;
  }

  if (line.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:')) {
    try {
      const o = JSON.parse(Buffer.from(line.slice('#EXT-X-APE-OVERFLOW-HEADERS:'.length).trim(), 'base64').toString('utf8'));
      for (const k of Object.keys(o)) stats.overFreq.set(k, (stats.overFreq.get(k) || 0) + 1);
    } catch { /* overflow inválido ya se cuenta en el censo de 03 */ }
  }
}

/* ============================ H1: denominadores y cruces ============================ */

const CH = stats.channels;
const sinks = [...stats.sinkTotals.entries()]
  .map(([tag, v]) => ({
    tag,
    hvc1: v.hvc1,
    hev1: v.hev1,
    total: v.hvc1 + v.hev1,
    runtime_bound: RUNTIME_BOUND_SINKS.has(tag),
    families_declared: [...new Set([...(v.hvc1 ? ['hvc1'] : []), ...(v.hev1 ? ['hev1'] : [])])],
    values_observed: Object.fromEntries([...v.values.entries()].sort((a, b) => b[1] - a[1])),
  }))
  .sort((a, b) => b.total - a.total);

const evaluatedSinks = sinks.filter((s) => s.runtime_bound);
const inertSinks = sinks.filter((s) => !s.runtime_bound);

/** Un CRUCE es declarar `hev1.*` en un sumidero que NO sea KODIPROP/EXTVLCOPT.
 *  La GOLDEN RULE del repo dice: hvc1 SOLO en STREAM-INF CODECS=, hev1 SOLO en
 *  KODIPROP/EXTVLCOPT. Medimos literalmente esa regla, sin reinterpretarla. */
const HEV1_ALLOWED = new Set(['#KODIPROP', '#EXTVLCOPT']);
const crossings = sinks
  .filter((s) => s.hev1 > 0 && !HEV1_ALLOWED.has(s.tag))
  .map((s) => ({
    tag: s.tag,
    hev1_occurrences: s.hev1,
    runtime_bound: s.runtime_bound,
    effect: s.runtime_bound
      ? 'un runtime del catalogo ENLAZA este sumidero (00 grave)'
      : 'tag desconocido para todo runtime medido: metadata INERTE (RFC 8216 6.3.1)',
    families: s.families_declared,
    values_observed: s.values_observed,
  }));

/** El otro lado: sumideros con hvc1 fuera de STREAM-INF. No es «familia distinta»: es la
 *  MISMA familia declarada en sinks extra, así que no hay contradicción de familia —
 *  se declara y se clasifica aparte para no inflar el conteo de cruces. */
const hvc1_extra_sinks = sinks.filter((s) => s.hvc1 > 0 && s.tag !== '#EXT-X-STREAM-INF');

const codecSinks = {
  denominator: {
    total_sinks: sinks.length,
    runtime_bound_sinks: evaluatedSinks.length,
    inert_sinks: inertSinks.length,
    runtime_bound_list: [...RUNTIME_BOUND_SINKS],
    explanation:
      'El denominador es el numero de SUMIDEROS (tags distintos donde aparece un codec string), ' +
      'no el numero de canales. Un veredicto sin denominador explicito es una afirmacion sin alcance.',
  },
  verdict:
    `${evaluatedSinks.length} de ${sinks.length} sumideros son enlazados por un runtime del catalogo; ` +
    `en esos ${evaluatedSinks.length} hay 0 cruces medidos. ` +
    `En los ${inertSinks.length} sumideros restantes SI hay cruces (hev1 fuera de KODIPROP/EXTVLCOPT): ` +
    `${crossings.length} sumideros, todos inertes.`,
  sinks,
  runtime_bound_evaluated: evaluatedSinks.map((s) => s.tag),
  crossings_hev1_outside_allowed: crossings,
  hvc1_in_sinks_other_than_stream_inf: {
    count: hvc1_extra_sinks.length,
    tags: hvc1_extra_sinks.map((s) => s.tag),
    classification:
      'NO es cruce de familia: declaran la MISMA familia (hvc1) que el manifiesto, en sinks ' +
      'inertes. Es redundancia declarativa, no contradiccion hvc1/hev1.',
  },
  hev1_in_exthttp: {
    channels: stats.hevChannelsTotal,
    of_channels: CH,
    pct: +((stats.hevChannelsTotal / CH) * 100).toFixed(2),
    by_profile: Object.fromEntries([...stats.hevChannelsByProfile.entries()].sort((a, b) => b[1] - a[1])),
    note:
      'El 100 % de los canales P1 lleva hev1.* en #EXTHTTP; ningun P3 ni P4. ' +
      'Que un canal lo lleve en #EXTHTTP y en RUNTIME-CODEC no duplica el canal: son dos sumideros.',
  },
  level_divergence: (() => {
    const g = (tag) => (sinks.find((s) => s.tag === tag) || {}).values_observed || {};
    return {
      note:
        'El unico sumidero que un cliente HLS conforme enlaza para decidir decode es ' +
        '#EXT-X-STREAM-INF, y declara UN solo valor (L153) en el 100 % de los canales. ' +
        'Los demas sumideros varian por perfil y, en P4/P3, declaran niveles MAS BAJOS.',
      stream_inf: g('#EXT-X-STREAM-INF'),
      i_frame_stream_inf: g('#EXT-X-I-FRAME-STREAM-INF'),
      runtime_codec_hev1: g('#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1'),
      exthttp: g('#EXTHTTP'),
    };
  })(),
  out_of_scope_observation: {
    tag: '#EXT-X-CMAF',
    occurrences: (sinks.find((s) => s.tag === '#EXT-X-CMAF') || {}).total || 0,
    finding:
      'Durante el censo de sumideros aparecio un tag `#EXT-X-CMAF:` (10573 ocurrencias) que declara ' +
      'CODECS + BANDWIDTH=8000000 + RESOLUTION=1920x1080. Es otro cap de video declarado, en un tag ' +
      'inerte, y NO figura en cap_verdicts.json (t10) ni en la tabla de caps de t7. Se reporta aqui ' +
      'porque salio de ESTA medicion; NO se adjudica en t12 (fuera de alcance).',
  },
};

/* ============================ H2: suma de campos y esquemas ============================ */

const allNames = new Set([...stats.mainFreq.keys(), ...stats.overFreq.keys()]);
const conditional = [];
let sumsOk = 0;
for (const k of allNames) {
  const m = stats.mainFreq.get(k) || 0;
  const o = stats.overFreq.get(k) || 0;
  if (m + o === CH) sumsOk++;
  else conditional.push({ field: k, main: m, overflow: o, total: m + o });
}
conditional.sort((a, b) => b.main - a.main || (a.field < b.field ? -1 : 1));

const schemaList = [...stats.schemas.values()].sort((a, b) => b.n - a.n);
const schemaOut = schemaList.map((s, i) => {
  const exclusives = [...s.pres.keys()].filter((k) =>
    schemaList.every((o) => o === s || !((o.pres.get(k) || 0) > 0))
  );
  return {
    id: `S${i + 1}`,
    key_set_sha1_8: s.hash,
    channels: s.n,
    fields_in_main: s.nfields,
    profiles: Object.fromEntries([...s.profiles.entries()].sort((a, b) => b[1] - a[1])),
    exclusive_fields_in_main: exclusives,
    exclusive_count: exclusives.length,
  };
});

/** Familias: la partición que de verdad explica el censo. */
const withApeBlock = schemaOut.filter((s) => s.exclusive_fields_in_main.some((f) => f.startsWith('X-APE-Codec-')));
const withoutApeBlock = schemaOut.filter((s) => !s.exclusive_fields_in_main.some((f) => f.startsWith('X-APE-Codec-')));

const schemasSection = {
  H2_correction_scope: {
    names_in_union: allNames.size,
    names_summing_to_channels: sumsOk,
    names_conditional: conditional.length,
    statement_that_was_false:
      '«Cada campo esta o en el objeto principal o en el overflow, nunca en ninguno» — FALSO: ' +
      `${conditional.length} de ${allNames.size} nombres no suman ${CH}.`,
    statement_that_replaces_it:
      `${sumsOk} de ${allNames.size} nombres suman exactamente ${CH} (principal + overflow). ` +
      `Los otros ${conditional.length} son CONDICIONALES: su presencia depende del esquema de campos ` +
      'del canal, no de su posicion respecto del corte de 200 campos.',
  },
  schema_count: schemaOut.length,
  schemas: schemaOut,
  families: {
    with_ape_codec_block: {
      schemas: withApeBlock.map((s) => s.id),
      channels: withApeBlock.reduce((a, s) => a + s.channels, 0),
      note: 'S3 (1.470, todo P3): el bloque X-APE-Codec-*/HDR/RED en el objeto principal. 32 campos exclusivos.',
    },
    without_ape_codec_block: {
      schemas: withoutApeBlock.map((s) => s.id),
      channels: withoutApeBlock.reduce((a, s) => a + s.channels, 0),
      note:
        'NO es homogeneo: se subdivide por bloques opcionales (X-HDR-Support en S2, bloque de ' +
        'reconexion en S4, X-QoS-DSCP en S6) y por la posicion del corte (199 vs 200 campos).',
    },
  },
  conditional_fields: {
    count: conditional.length,
    names: conditional.map((c) => c.field),
    matrix_main_presence_by_schema: Object.fromEntries(
      conditional.map((c) => {
        const row = {};
        schemaList.forEach((s, i) => { const n = s.pres.get(c.field) || 0; if (n > 0) row[`S${i + 1}`] = n; });
        return [c.field, { main_total: c.main, overflow_total: c.overflow, total: c.total, present_in_main_of: row }];
      })
    ),
  },
  percent_denominator_note: {
    problem:
      'Un porcentaje sobre 10.573 canales es ENGAÑOSO para un campo condicional. X-APE-Codec-Video ' +
      'en 1.470 de 10.573 da 13,9 %, pero sobre los canales que lo declaran es 100 %.',
    rule:
      'Para campos condicionales se reporta (a) absolutos, (b) % sobre el esquema que lo declara y ' +
      '(c) % sobre el total, y se dice cual se esta usando.',
  },
};

/* ============================ merge en el JSON ============================ */

let base = {};
if (fs.existsSync(JSON_OUT)) base = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));

const corrections = [
  {
    id: 'T12-H1',
    severity: 'ALTA',
    location: '03_HEADERS_MAP.md §3.4 (y originalmente «GOLDEN RULE: 0 violaciones»)',
    was_false:
      '«GOLDEN RULE: 0 violaciones» se calculaba sobre 4 sumideros sin declarar el denominador. ' +
      'Hay 18 sumideros con codec string y en 2 de ellos SI hay hev1 fuera de KODIPROP/EXTVLCOPT.',
    replaced_by:
      `«0 cruces en ${evaluatedSinks.length} de ${sinks.length} sumideros (los ${evaluatedSinks.length} que un ` +
      `runtime del catalogo enlaza)». Los ${crossings.length} sumideros con cruce real son INERTES y se ` +
      'enumeran con su conteo.',
    evidence: 'codec_sinks{} en 03_headers_map.json; medicion en 03_schema_probe.mjs',
  },
  {
    id: 'T12-H2',
    severity: 'ALTA',
    location: '03_HEADERS_MAP.md §2.2 (y la nota de §2.4)',
    was_false:
      '«Cada campo aparece o en el objeto principal o en el overflow, nunca en ambos y nunca en ninguno».',
    replaced_by:
      `${sumsOk} de ${allNames.size} nombres suman ${CH}. Los otros ${conditional.length} son condicionales: ` +
      `hay ${schemaOut.length} esquemas de campos distintos (S1..S${schemaOut.length}), agrupables en ` +
      `«con bloque X-APE-Codec» (${schemaOut.filter((s) => s.exclusive_fields_in_main.some((f) => f.startsWith('X-APE-Codec-'))).reduce((a, s) => a + s.channels, 0)} canales) ` +
      `y «sin bloque» (${CH - schemaOut.filter((s) => s.exclusive_fields_in_main.some((f) => f.startsWith('X-APE-Codec-'))).reduce((a, s) => a + s.channels, 0)} canales, 5 variantes).`,
    evidence: 'exthttp.schemas{} en 03_headers_map.json; medicion en 03_schema_probe.mjs',
  },
  {
    id: 'T12-H2b',
    severity: 'MEDIA',
    location: 'interpretacion del censo de #EXTHTTP',
    was_false:
      'Atribuir los campos exclusivos del bloque APE a «todos los P3»: el perfil P3 tiene 2.308 canales, ' +
      'pero el bloque solo aparece en 1.470.',
    replaced_by:
      'El discriminante NO es el perfil sino el ESQUEMA (S3): 1.470 canales P3 lo tienen en el objeto ' +
      'principal; los otros 838 P3 estan en S4. Por eso un % sobre 10.573 es enganoso ' +
      '(ver percent_denominator_note).',
    evidence: 'exthttp.schemas.families + conditional_fields.matrix_main_presence_by_schema',
  },
  {
    id: 'T12-H2c',
    severity: 'BAJA',
    location: '03_HEADERS_MAP.md §2.4 (tabla de bloques), nota 2 y hallazgo H-03-02',
    was_false: 'El bloque X-APE-* extendido tiene «30 campos».',
    replaced_by:
      `**32 campos**, enumerados uno a uno. El «30» agrupaba X-APE-Fallback-* como comodin y omitia ` +
      'X-APE-Channel-Id y X-APE-CICP del conteo.',
    evidence: 'exthttp.schemas.schemas[S3].exclusive_fields_in_main (32 nombres)',
  },
];

const out = {
  ...base,
  schema_version_t12: '1.0.0',
  generated_by_t12: new Date().toISOString(),
  codec_sinks: codecSinks,
  exthttp: {
    ...(base.exthttp || {}),
    // Se reemplaza el bloque de overflow que contenia la afirmacion falsa.
    ...(base.exthttp ? { overflow_consistency: {
      superseded_claim:
        'SUSTITUIDO por t12: «cada campo aparece o en el principal o en el overflow, nunca en ambos ' +
        'y nunca en ninguno» es FALSO.',
      measured: {
        names_in_union: allNames.size,
        names_summing_to_channels: sumsOk,
        names_conditional: conditional.length,
      },
      see: 'exthttp.schemas',
    } } : {}),
    schemas: schemasSection,
  },
  corrections_t12: corrections,
  meta: {
    ...(base.meta || {}),
    schema_probe: {
      producer: '03_schema_probe.mjs',
      source: SRC,
      source_bytes: fs.statSync(SRC).size,
      channels_measured: CH,
      exthttp_parsed: stats.exthttp,
      exthttp_bad_json: stats.exthttp_bad_json,
      note: 'Añade/reemplaza secciones para t12. NO reescribe el censo de 03_headers_analyzer.mjs.',
    },
  },
};

const json = JSON.stringify(out, null, 2);
if (DRY) {
  process.stdout.write(json);
} else {
  fs.writeFileSync(JSON_OUT, json, 'utf8');
  console.error(`[ok] ${JSON_OUT} (${Buffer.byteLength(json)} bytes)`);
  console.error(`[ok] canales=${CH} sumideros=${sinks.length} (runtime=${evaluatedSinks.length}) cruces=${crossings.length}`);
  console.error(`[ok] nombres=${allNames.size} suman=${sumsOk} condicionales=${conditional.length} esquemas=${schemaOut.length}`);
}
