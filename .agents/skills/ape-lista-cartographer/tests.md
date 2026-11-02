# tests.md — ape-lista-cartographer

Cada caso tiene un resultado **observado** (no esperado-a-ojo) y su comando. Cuando un caso depende
del entorno (ffmpeg/VLC instalados) se declara el estado en que queda si el entorno falta.

Máquina de referencia de los resultados anotados: Windows, Node `v24.12.0`,
`ffmpeg 8.0.1-full_build-www.gyan.dev`, VLC `3.0.24` (inventario leído del disco, proceso **no**
ejecutado).

---

## T1 — Sintaxis de los dos scripts

```bash
node --check .agents/skills/ape-lista-cartographer/scripts/map_list.js
node --check .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js
```

**Esperado:** exit 0 en ambos. **Si falla:** nada más vale; no se publica cartografía.

---

## T2 — El mapper corre sobre un bloque de 1 canal y cuadra la identidad

```bash
node scripts/map_list.js fixtures/canal_001_P3.txt --out <tmp> --expect-channels 1
```

**Esperado:** exit 0; `source.channels = 1`; `blocks.sum_check_exact = true`;
`tag_vocabulary.distinct = 687`; `blocks.lines_after_uri` con valor 3 (el URI **no** es la última
línea); `source.encoding.utf8_errors = 0`.

**Estado observado (2026-11-02):** PASS — 977 líneas, 687 tags, p50 977, `sum_check_exact=true`,
`lines_after_uri = 3→1`.

---

## T3 — Control de fugas: el fixture no lleva host ni credenciales

```bash
# sobre el fixture emitido por --fixture
Select-String -Path fixtures/canal_001_P3.txt -Pattern '<el host real>'      # 0 coincidencias
Select-String -Path fixtures/canal_001_P3.txt -Pattern 'eyJ[A-Za-z0-9_-]{8,}'  # 0
```

El propio mapper aborta con exit 2 si detecta una fuga (`ASSERTION: el fixture contiene
host/credencial sin redactar`), y lo mismo sobre el JSON/Markdown finales
(`leak_checks.host_occurrences_in_output = 0`, `credential_occurrences_in_output = 0`).

**Esperado:** exit 0 y `leak_checks` en cero con `sha256_preserved = true` (si el scrub borrase el
sha256, el informe perdería su identidad).

---

## T4 — Una cadena rota falla con el mensaje literal del parser

```bash
node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_literal.txt
```

**Esperado:** `FAIL`, `exit=-34` y primer error
`[Parsed_unsharp_2 …] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]`.

**Estado observado:** PASS del test (es decir, FAIL de la cadena, que es lo correcto).
Exit normalizado a `-34` (ffmpeg lo devuelve truncado a 32 bits: `4294967262`).

---

## T5 — La misma cadena, con el defecto corregido, pasa

```bash
node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_corregida.txt
```

**Esperado:** `PASS`, `exit=0`. **Estado observado:** PASS (132 ms, 20 frames a 640x360).

---

## T6 — `--per-stage` revela la cascada completa de defectos

```bash
node scripts/validate_filter_chain.js --chain-file fixtures/chains/P1_literal.txt --per-stage
```

**Esperado:** la cadena completa falla en `unsharp`; aisladas, fallan **tres** etapas:
`unsharp` (`chroma_msize_x` fuera de `[3..23]`), `zscale` (`Undefined constant … 'st2084'`) y
`minterpolate` (`scd=5` fuera de `[0..1]`), y pasan `nlmeans`, `bwdif`, `gradfun`.

**Estado observado:** PASS — exactamente esas tres etapas aisladas fallando, con esos tres mensajes.

> Este caso es la prueba de que el defecto **no** es sintáctico-global: es una cascada, y por eso
> el validador por etapas es obligatorio para no quedarse en el primer error.

---

## T7 — Sin ffmpeg devuelve NO_COMPUTADO, nunca PASS

```bash
node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_corregida.txt --ffmpeg /ruta/inexistente
```

**Esperado:** `ESTADO: NO_COMPUTADO` y exit **3**, con la razón (`ffmpeg no disponible (…)`).
Nunca exit 0.

---

## T8 — Mapper sin ffmpeg: la sintaxis queda NO_COMPUTADO y se declara

```bash
node scripts/map_list.js <lista> --out <tmp> --no-ffmpeg
```

**Esperado:** `video_filter.syntax.status = "NO_COMPUTADO"` y `not_computed` con la entrada
correspondiente. El resto de la cartografía se emite igual.

---

## T9 — Censo vs muestra: la estructura no cambia

```bash
node scripts/map_list.js <lista> --out <dirA>                  # censo
node scripts/map_list.js <lista> --out <dirB> --sample 250     # muestra
# comparar en ambos JSON: source.sha256, source.lines, source.channels, blocks.{min,p50,max,sum}
```

**Esperado:** idénticos en estructura (la muestra solo afecta a las capas pesadas:
`exthttp.objects_analyzed` y `overflow.objects_analyzed`), y `scope.mode` distinto
(`censo` vs `muestra`) con su denominador.

---

## T10 — Idempotencia

Dos corridas consecutivas sobre el mismo archivo producen el mismo `source.sha256` y las mismas
cifras estructurales. `tool.elapsed_ms` y `generated_at` cambian por diseño.

---

## T11 — Contraste con una segunda implementación

```bash
rg -c '^#EXTINF' <lista>
rg -c '^#EXTHTTP:' <lista>
rg -c '^#EXT-X-APE-' <lista>
```

**Esperado:** los tres valores coinciden con `source.channels`, `exthttp.lines_census` y
`families.ape.lines` del JSON.

---

## T12 — Lista degenerada (1 canal, sin cabecera)

Caso cubierto por T2: el fixture no tiene cabecera. **Esperado:** `header.lines = 0`,
`blocks.n = 1`, ningún tag contado como "sólo cabecera" por culpa del `#EXTINF` inicial.

---

## T13 — Línea patológicamente larga / archivo sin salto final

El lector corta a 64 MiB por línea y aborta con error explícito (no consume memoria). Un archivo
sin `\n` final se procesa como última línea y se reporta `ends_with_newline = false`.

---

## T14 — `--expect-channels` como gate de CI

```bash
node scripts/map_list.js <lista> --out <dir> --expect-channels 10573   # exit 0
node scripts/map_list.js <lista> --out <dir> --expect-channels 1       # exit 2
```

**Esperado:** exit 2 y `ASSERTION: canales N != esperado M` cuando no coincide.

---

## T15 — Los chequeos con valor GLOBAL de cabecera no pueden dar 0 por parser ciego

`#EXT-X-VERSION`, `#EXT-X-PART-INF` y `#EXT-X-SERVER-CONTROL` aparecen **una vez, en la cabecera**;
`#EXT-X-CMAF-VERSION`, `-PART-TARGET` y `-PART-HOLD-BACK` aparecen **por canal**. La comparación es
global-vs-por-canal.

```bash
node -e "const m=JSON.parse(require('fs').readFileSync('<map.json>','utf8'));
const g=Object.fromEntries(m.coherence.contradictions.map(c=>[c.id,c.channels]));
console.log('C7',g.C7,'C8',g.C8,'C9',g.C9);
if (g.C7===0||g.C8===0||g.C9===0) { console.error('PARSER CIEGO: un valor de cabecera no se capturo'); process.exit(1); }"
```

**Esperado:** los tres > 0 en la lista de referencia (10.573 cada uno).

**Por qué existe este test:** la primera implementación devolvía 0 en C8/C9 y *parecía* una medición
("no hay desalineación"); en realidad el parser no leía los tags de cabecera. Un 0 por ceguera del
parser es indistinguible de un 0 real si no hay un test que lo distinga.

---

## Smoke E2E (secuencia mínima antes de publicar)

```bash
node --check scripts/map_list.js && node --check scripts/validate_filter_chain.js \
 && node scripts/map_list.js fixtures/canal_001_P3.txt --out /tmp/t --expect-channels 1 \
 && node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_corregida.txt \
 && node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_literal.txt --per-stage
```

**Criterio de aceptación:** el 3.º comando sale 0, el 4.º sale 0 y el 5.º sale 1 (FAIL esperado de
la cadena literal). Cualquier otra combinación es regresión.
