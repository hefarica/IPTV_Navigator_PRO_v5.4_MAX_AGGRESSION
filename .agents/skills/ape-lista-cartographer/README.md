# ape-lista-cartographer

Cartografía forense **0 → 100 %** de una lista APE (M3U/M3U8 con capas propietarias), con mapper
ejecutable y estados de evidencia explícitos.

Hermana instrumental de [`ape-image-pipeline-truth`](../ape-image-pipeline-truth/SKILL.md): aquélla
dice **qué es verdad** del pipeline de imagen; ésta **lo mide** sobre una lista concreta y emite el
artefacto.

## Qué resuelve

| Sin esta skill | Con esta skill |
|---|---|
| "la lista tiene ~975 líneas por canal" | `blocks.p50 = 976`, histograma de 8 tallas y su causa medida |
| "los filtros son válidos" | `video_filter.syntax.status = FAIL` con el parámetro, el rango real de `ffmpeg -h` y el mensaje del parser al ejecutar |
| "los headers están bien" | `JSON.parse` de cada objeto + 0 tóxicos exactos + lookalikes distinguidos |
| "esto se aplica en VLC" | matriz runtime × etapa con `verdict` y `verdict_playlist` separados, y `aplicado`/`verificado` en **0 celdas** |
| "parece que cambió" | `map_<sha8>.json` de ayer vs hoy: diff de cifras, no de impresiones |

## Estructura

```
ape-lista-cartographer/
  SKILL.md                    especificación (14 secciones) + reglas de oro
  README.md                   este archivo
  scripts/
    map_list.js               mapper: 1 pase (censo) o 2 (muestra) → JSON + Markdown
    validate_filter_chain.js  juez de ejecución: y4m sintético + -filter_script → PASS/FAIL
  fixtures/
    canal_001_P3.txt          bloque real de 1 canal (host/usuario/contraseña enmascarados)
    canal_5739_P4_corto.txt   bloque real de 954 líneas (el caso estructuralmente distinto)
    chains/                   cadenas de filtros medidas, para tests
  reports/
    map_<sha8>.json/.md       salida real del mapper sobre la lista de referencia
  checklist.md  commands.md  tests.md  references.md  install.lock.json  audit-report.md
  examples/                   invocaciones canónicas
```

## Arranque en 60 segundos

```bash
# 1) cartografía completa (censo) — decenas de segundos sobre 600 MB
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista.m3u8> --out <dir>

# 2) modo rápido: estructura censal + detalle de 250 canales
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista.m3u8> --out <dir> --sample 250

# 3) validar la cadena de filtros dominante contra el ffmpeg instalado
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js \
     --from-list <lista.m3u8> --limit 5
```

## Qué NO hace

- No hace red: salud HTTP, variantes reales y bitstream quedan `NO COMPUTADO` **por diseño**.
- No ejecuta players: la matriz de runtimes se apoya en medición heredada y citada.
- No reescribe la lista: solo lectura.
- No mide píxeles: `aplicado` y `verificado` quedan vacíos hasta que exista un diff de frames.

## Referencia medida

La cartografía completa de `APE_LISTA_1793589060441.m3u8` (604.593.696 B,
`sha256 523d52a6…5049d6`) vive en
[`docs/cartography/APE_LISTA_523d52a6/`](../../../docs/cartography/APE_LISTA_523d52a6/):
`01_STRUCTURE.md`, `02_VIDEO_FILTER_MATRIX.md`, `03_HEADERS_MAP.md`, `04_LANE_CAPABILITY_MATRIX.md`.
Esta skill los reproduce sobre cualquier lista con un solo comando.
