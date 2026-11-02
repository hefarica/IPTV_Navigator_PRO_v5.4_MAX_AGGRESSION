# examples/ — invocaciones canónicas

Casos reales, copiables. Todos asumen CWD = raíz del repo.

## 1. Cartografía de una lista nueva (censo)

```bash
node .agents/skills/ape-lista-cartographer/scripts/map_list.js /ruta/lista.m3u8 --out /tmp/carto
# → /tmp/carto/map_<sha8>.json + map_<sha8>.md
```

Leer en el JSON: `source.sha256`, `blocks.sum_check_exact`, `tag_vocabulary.distinct`,
`video_filter.distinct_chains`, `exthttp.invalid`, `coherence.contradictions`, `runtime_matrix.counts`,
`not_computed`.

## 2. Auditoría rápida (estructura censal + detalle muestreado)

```bash
node .agents/skills/ape-lista-cartographer/scripts/map_list.js /ruta/lista.m3u8 \
     --out /tmp/carto --sample 250
```

La estructura (líneas, bloques, vocabulario, familias) sigue siendo censal; solo las capas pesadas
(`JSON.parse` de `#EXTHTTP` y decodificación del overflow) se limitan a los 250 canales muestreados.
`scope.mode` lo declara.

## 3. ¿Las cadenas de filtros de esta lista son ejecutables?

```bash
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js \
     --from-list /ruta/lista.m3u8 --json
```

Devuelve PASS/FAIL por firma distinta, con el número de canales afectados y el mensaje literal del
parser. Si algo falla, aislar la etapa culpable:

```bash
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js \
     --chain-file /tmp/cadena_que_falla.txt --per-stage
```

## 4. Gate de CI sobre la identidad de la lista

```bash
node .agents/skills/ape-lista-cartographer/scripts/map_list.js /ruta/lista.m3u8 \
     --out /tmp/carto --expect-channels 10573 --quiet
# exit 0 si el conteo coincide; exit 2 si no.
```

## 5. Fixture de un canal concreto, para probar el propio mapper

```bash
node .agents/skills/ape-lista-cartographer/scripts/map_list.js /ruta/lista.m3u8 \
     --out /tmp/carto --fixture 1 \
     --fixture-out .agents/skills/ape-lista-cartographer/fixtures/canal_001_P3.txt
```

El canal sale con host, usuario, contraseña y tokens sustituidos. El mapper aborta (exit 2) si
detecta una fuga.

## 6. Deriva entre dos generaciones de la misma lista

```bash
node scripts/map_list.js /ruta/lista_v1.m3u8 --out /tmp/a --sample 250
node scripts/map_list.js /ruta/lista_v2.m3u8 --out /tmp/b --sample 250
# comparar los dos JSON campo a campo (jq, Node o diff del Markdown)
```

Las cifras a comparar primero: `source.lines`, `source.channels`, `blocks.histogram`,
`tag_vocabulary.distinct`, `video_filter.distinct_chains`, `exthttp.field_stats`,
`coherence.contradictions`.

## 7. Mini-script Node para diff de dos cartografías

```js
// node diff_map.js a.json b.json
const fs = require('node:fs');
const [A, B] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
const pick = (m) => ({
  lines: m.source.lines, channels: m.source.channels,
  block_p50: m.blocks.p50, block_max: m.blocks.max,
  tags: m.tag_vocabulary.distinct, chains: m.video_filter.distinct_chains,
  exthttp_fields_p50: m.exthttp.field_stats && m.exthttp.field_stats.p50,
  toxic: Object.keys(m.exthttp.toxic_hits).length,
});
console.log({ a: pick(A), b: pick(B) });
```
