---
name: ape-lista-cartographer
description: Use when a .m3u8/.m3u playlist with APE layers has to be mapped 0→100 % instead of eyeballed — identifying it by bytes+sha256, delimiting header and channel blocks, censusing the tag vocabulary, detokenizing and validating filter chains against the real ffmpeg, validating #EXTHTTP as JSON and hunting toxic headers, and deriving the runtime capability matrix (VLC/OTT/TiviMate/ExoPlayer/Kodi/VPS-ARA) from measured evidence. Fires on "cartografía", "mapear la lista", "cuántos canales/líneas/tags", "qué filtros emite", "qué headers lleva", "¿esto se aplica en VLC?", "¿qué runtime lo ejecuta?", "map_*.json", "línea base estructural", and whenever a claim about a playlist would otherwise be made without a reproducible artifact.
specialist: S1
kind: anchor
parent_anchor: ape-image-pipeline-truth
---

# ape-lista-cartographer — cartografía forense 0→100 % de una lista APE

> **Tesis:** una lista APE no se describe, se **mide**. Cada cifra que se publique de ella tiene
> que salir de un comando reproducible sobre los bytes, y cada afirmación sobre lo que un player
> "aplica" tiene que llevar su estado de evidencia. Lo que no se puede medir se declara
> `NO COMPUTADO` con su razón — nunca se rellena con una estimación.

Esta skill es la hermana instrumental de `ape-image-pipeline-truth`: **aquélla dice qué es verdad
del pipeline; ésta lo mide sobre una lista concreta y emite el artefacto.**

---

## 1. Nombre y propósito

`ape-lista-cartographer` — protocolo + mapper ejecutable para producir la cartografía estructural,
de metadatos, de filtros y de capacidad por runtime de **cualquier** lista APE, con estados de
evidencia explícitos y sin muestreo silencioso.

Propósito operativo: que ninguna auditoría de lista vuelva a depender de un tramo fijo de líneas,
de una muestra no declarada, de un conteo "a ojo" ni de una tabla hardcodeada presentada como
medición.

## 2. Cuándo usarla

- Hay que describir una lista (canales, líneas, bloques, vocabulario de tags) y la descripción va a
  usarse para decidir algo (generar, comparar generaciones, auditar, refactorizar).
- Se sospecha deriva estructural: bloques de tamaño distinto, canales sin la escalera declarativa,
  familias de tags que aparecen o desaparecen.
- Se va a afirmar que un filtro/cadena "se aplica", "mejora" o "es inválido".
- Se va a emitir o revisar un `#EXTHTTP` (JSON válido, cap de campos, headers tóxicos).
- Se necesita la matriz de capacidad por runtime para decidir qué se emite a cada player.
- Antes y después de un cambio en el generador: mismo comando, misma lista, diff de JSON.

## 3. Cuándo NO usarla

- Para decidir **calidad visual real** de un canal: eso exige probe del manifest remoto y del
  bitstream, y esta skill es estática y sin red. Su propio informe lo declara `NO COMPUTADO`.
- Como sustituto de la doctrina: las reglas de emisión viven en `ape-image-pipeline-truth` y en
  `AGENTS.md`/`CLAUDE.md`; esta skill mide, no legisla.
- Sobre VPS en producción o Excel: fuera de alcance por doctrina (`iptv-vps-touch-nothing`,
  `iptv-excel-safe-mode`).
- Para "arreglar" una lista: la skill lee y reporta. No reescribe la lista objetivo.

## 4. Modelo de evidencia (la escalera y su techo)

Cada afirmación de la cartografía se etiqueta con **uno** de estos estados. La escalera es
monótona y su techo es lo que la hace honesta:

| Estado | Significado | Quién lo alcanza |
|---|---|---|
| `declarado` | está escrito en la lista | cualquier tag/atributo presente |
| `observado` | medido sobre los bytes por el mapper | censos, distribuciones, histogramas |
| `resuelto` | validado contra una herramienta real | `JSON.parse`, `ffmpeg -h`, `ffmpeg` ejecutando, `Get-FileHash` |
| `heredado_citado` | medido en otra sesión, citado con su artefacto | matriz de runtimes, `unsafe option` de VLC |
| `aplicado` | el runtime **ejecutó** el mecanismo | requiere player en ejecución → **0 celdas** aquí |
| `verificado` | el frame cambió y se midió el diff | requiere captura de frames → **0 celdas** aquí |
| `no_computado` | no se puede medir en este entorno, con razón | red, players, píxeles |
| `fallido` | la medición se hizo y el claim NO se sostiene | JSON inválido, violación de rango |

**Regla de oro de la escalera:** `PASS` de sintaxis ≠ `aplicado`; `aplicado` ≠ `verificado`.
Ningún informe de esta skill puede cerrar con una celda en `verificado` salvo que exista un diff
de frames con artefacto. Si no existe, se dice.

## 5. Inputs

- Ruta de la lista (solo lectura). El mapper la hashea en el mismo pase de lectura.
- `ffmpeg` en PATH (o `--ffmpeg <ruta>`). Sin ffmpeg, los pasos 5 y 6 quedan `NO_COMPUTADO`.
- Opcional: `VLC` instalado (se detecta por directorio; **no se ejecuta**, ver §9).
- Opcional: `--vlc-version` si el operador conoce la versión (el binario de Windows es GUI y
  bloquea la consola al pedirle `--version`).
- Nada de red. Nada de credenciales: si la lista las lleva, se enmascaran antes de escribir.

## 6. Procedimiento 0 → 100 %

Diez pasos. Cada uno deja artefacto; si un paso no se puede ejecutar, se escribe `NO COMPUTADO`
con su razón y se sigue.

### Paso 0 — Encuadre
Fijar el objetivo (¿estructura? ¿filtros? ¿headers? ¿capacidad?) y la ruta. Declarar si el análisis
es **censo** o **muestra**, y con qué denominador. Una muestra sin denominador declarado no es
evidencia.

### Paso 1 — Identidad (bytes + sha256 + codificación)
Un solo pase que cuenta bytes, calcula SHA-256 y valida UTF-8 estricto. Nunca se identifica una
lista por su nombre: los nombres se repiten y las listas cambian por debajo.

```bash
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir>
# → source.bytes, source.sha256, source.lines, encoding.{utf8_errors,crlf_lines,max_line_len}
```

### Paso 2 — Cabecera y delimitación del bloque
El bloque de canal **no** es un tramo fijo: se delimita por `#EXTINF`. Se mide su distribución
completa (min/p50/media/p90/p95/p99/máx/suma) y se comprueba la identidad aritmética
`cabecera + Σbloques == líneas totales`. Si no cuadra, la delimitación está mal: no se publica nada
más hasta arreglarla.

Señales que hay que mirar siempre:
- **tallas distintas** de bloque → huella de qué capas se inyectaron, no ruido;
- **`lines_after_uri > 0`** → el URI **no** es la última línea del bloque (contradice la doctrina
  "URL final del bloque");
- líneas vacías por bloque y su posición.

### Paso 3 — Vocabulario de tags (censo)
Se censan **nombres distintos** y **líneas por nombre**, no una lista de los que uno recuerda.
Después se clasifican por familia y se separan los que viven sólo en cabecera, sólo en bloque o en
ambos. La plantilla fija son los tags con exactamente `1 × canales` líneas.

### Paso 4 — Esquemas con atributos
`#EXTINF` (atributos M3U Plus separados por **espacios**, no por comas), `#EXT-X-STREAM-INF`
(atributos HLS separados por **comas**), `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-DATERANGE`,
`#EXTVLCOPT`, `#KODIPROP`, `#EXTATTRFROMURL`. De cada uno: claves, cardinalidad y valores cuando la
cardinalidad es baja (las claves únicas por canal se reportan como `alta cardinalidad`).

### Paso 5 — Destokenizar y validar las cadenas de filtros
1. Extraer **todas** las cadenas `video-filter` y agrupar por firma exacta (no por muestra).
2. Parsear cada firma respetando las dos gramáticas: ffmpeg (`nombre=p1=v1:p2=v2`) y VLC
   (`modulo{opt=val,...}` separados por `:`).
3. Validar **nombres y rangos numéricos** contra `ffmpeg -h filter=NAME` del binario instalado
   (rangos y enums reales, sin tabla hardcodeada).
4. Validar **ejecución** con el juez de verdad:

```bash
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js --chain-file <cadena.txt> --per-stage
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js --from-list <lista> --limit 5
```

El reparto de responsabilidades es deliberado y no se mezcla:

| Herramienta | Qué juzga | Qué NO juzga |
|---|---|---|
| `ffmpeg -h filter=NAME` (dentro del mapper) | nombre de filtro/parámetro, rango numérico | constantes simbólicas (`zscale transfer=st2084`), ejecución |
| `validate_filter_chain.js` | el filtergraph se construye y produce frames | que el filtro mejore la imagen |

**Cascada de defectos:** un FAIL sólo muestra el primer defecto. Para ver todos en una corrida:
`--per-stage`. Un mismo parámetro roto en las N cadenas es un defecto del emisor, no de la lista.

### Paso 6 — `#EXTHTTP` como dato, no como texto
`JSON.parse` real sobre **cada** objeto. Se mide: validez, nº de campos, bytes, nombres distintos y
frecuencia. Se buscan los **6 headers tóxicos** exactos (case-insensitive) en el objeto principal
**y** en el overflow base64. Se distinguen **lookalikes** (`X-Priority`, `X-QoS-Priority`) para no
inflar el hallazgo. Se busca material credencial por **nombre** de header y por **forma** de valor
(`Bearer`, JWT) sin almacenar valores.

> El tope real de `#EXTHTTP` no se adivina: se mide si el corte es por **campos** o por **bytes**
> comparando la distribución de ambos contra el overflow. La lista de referencia corta a 200
> campos con margen de bytes, no a 8.192 B.

### Paso 7 — Coherencia entre capas
La misma verdad declarada en `#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXTHTTP`,
`#KODIPROP`, `#EXTVLCOPT`, `#EXT-X-DATERANGE`, `#EXTATTRFROMURL` y las familias propietarias se
compara **por canal**. Cada contradicción lleva su conteo y su porcentaje. Dos cosas distintas que
no deben confundirse:

- **GOLDEN RULE** `hvc1`/`hev1` (cruce del par prohibido) → violación doctrinal, severidad alta;
- **desalineación entre capas** (misma capa, valores distintos) → hallazgo de coherencia, no
  violación de la regla de oro.

### Paso 8 — Matriz de capacidad por runtime
Se construye por **etapa** (9 etapas de imagen) × **runtime** (VLC 3/4, OTT Navigator, TiviMate,
ExoPlayer/Media3, Kodi+ISA, hls.js, VPS/Lua, ARA/VPP), con dos veredictos por celda:

- `verdict` = capacidad del runtime (`N` nativo · `P` plugin/daemon · `D` declarativo · `I` imposible);
- `verdict_playlist` = lo que consigue **el tag de la playlist** (casi siempre `D`).

La matriz **no se promedia**: la fila VLC es `N` sólo por CLI; desde la playlist el mismo módulo es
`D` porque VLC descarta la opción por política. Cada celda lleva su calidad de evidencia
(`m` medido · `r` documentado · `s` ausencia documentada de mecanismo · `x` no medido) y su fuente.

### Paso 9 — Veredicto con estados
Se emiten los claims (V1..Vn) con su estado de §4 y la evidencia en la misma línea. Es el único
cierre aceptable: **no** un párrafo de conclusiones sin artefacto.

### Paso 10 — Publicar el artefacto
`map_<sha8>.json` (máquina) + `map_<sha8>.md` (humano) en `--out`. El nombre del archivo lleva el
sha del contenido analizado: dos listas distintas nunca pisan el mismo informe.

## 7. Outputs

| Artefacto | Contenido | Consumidor |
|---|---|---|
| `reports/map_<sha8>.json` | todas las métricas, esquema `ape-lista-cartographer/map@1` | diff entre generaciones, gates, RAG |
| `reports/map_<sha8>.md` | resumen legible: veredicto, tablas, estados, `NO COMPUTADO` | humano / informe |
| `fixtures/canal_XXX.txt` | bloque de 1 canal con host/usuario/contraseña enmascarados | caso de prueba del propio mapper |
| JSON de `validate_filter_chain.js` | PASS/FAIL por cadena y por etapa con mensaje literal del parser | decisión de emitir o no la cadena |

## 8. Validación

Antes de dar por buena una cartografía:

1. `node --check` de los dos scripts.
2. El propio mapper corre de punta a punta y **emite JSON que parsea** (lo verifica él mismo).
3. **Control de fugas:** 0 ocurrencias de host/credencial en la salida; el sha256 sí debe estar
   presente (si el scrub lo borró, el informe perdió su identidad).
4. **Identidad aritmética:** `cabecera + Σbloques == líneas` (si no, delimitación mal).
5. **Coherencia de conteos:** cada división por canal debe dar entero exacto
   (`líneas_familia / canales`), y el total declarado en cabecera (si existe) debe coincidir.
6. **Reproducibilidad:** dos corridas sobre el mismo archivo dan el mismo `sha256` y las mismas
   cifras estructurales.
7. **Contraste con una segunda implementación** (rg/ffprobe) de al menos 3 cifras.
8. `validate_filter_chain.js` reproduce el defecto publicado con su mensaje literal.

## 9. Reglas de oro (las que ya costaron caro)

1. **El bloque se delimita por `#EXTINF`, no por un tramo fijo.** Contar 189/256/108 líneas "por
   canal" produce refutaciones: los valores reales se obtienen dividiendo el total entre canales.
2. **El URI no es la última línea del bloque.** Si `lines_after_uri > 0`, cualquier parser que
   asuma "URL al final" pierde líneas.
3. **Un absoluto sin artefacto es un error.** `bt1886 = 0` era falso: existía como `BT.1886`
   (mayúsculas) 9.765 veces y 12.043 case-insensitive. Buscar antes de negar.
4. **No se invoca `vlc.exe` desde el mapper.** En Windows es GUI y bloquea la consola (>120 s
   medidos). Su inventario (plugins, `avfilter`) sí se lee del disco; su comportamiento se cita.
5. **`ffmpeg -h` no juzga constantes simbólicas.** `zscale transfer=st2084` pasa `-h` y falla al
   ejecutar (`Undefined constant`). Por eso existen las dos herramientas.
6. **Un parámetro roto en todas las cadenas no se "corrige" en el informe: se reporta.** El
   `unsharp chroma_msize_x=0` de la lista de referencia es del emisor.
7. **Ninguna muestra se presenta como censo.** Si se usó `--sample N`, el JSON lo dice en
   `scope.mode` y el Markdown también, con el denominador.
8. **Cero red.** La cartografía no hace peticiones: salud HTTP, variantes reales y bitstream quedan
   `NO COMPUTADO` por diseño, no por pereza.

## 10. Comandos permitidos

```bash
node scripts/map_list.js <lista> --out <dir>                 # censo completo
node scripts/map_list.js <lista> --out <dir> --sample 250    # estructura censal + detalle muestreado
node scripts/map_list.js <lista> --out <dir> --fixture 1 --fixture-out <ruta>
node scripts/map_list.js <lista> --out <dir> --expect-channels 10573   # assertion
node scripts/validate_filter_chain.js --chain-file <cadena.txt> --per-stage
node scripts/validate_filter_chain.js --from-list <lista> --limit 5 --json
node -e "JSON.parse(require('fs').readFileSync('<map.json>','utf8'))"  # control de esquema
rg -c '^#EXTINF' <lista>            # contraste independiente de una cifra
ffmpeg -hide_banner -h filter=<nombre>   # rangos reales del binario
```

## 11. Comandos prohibidos

- Cualquier escritura sobre la lista analizada (es solo lectura, siempre).
- `git` de cualquier tipo desde la skill.
- Red: `curl`/`wget`/fetch contra el proveedor para "completar" métricas.
- Ejecutar players (VLC/Kodi/ExoPlayer) para "ver si aplica" — eso es otra fase, con su arnés y su
  artefacto de log, no esta skill.
- Borrar o reescribir `reports/` de otra lista: el nombre lleva el sha por una razón.
- Hardcodear rangos de filtros, módulos de VLC o topes de `#EXTHTTP` como si fueran medición.

## 12. Checklist y rollback

Checklist completo en `checklist.md`. Rollback: la skill **no muta** nada fuera de su `--out`;
el único "rollback" posible es borrar el informe emitido. Si `--fixture` se escribió en una ruta del
repo, se restaura con `git checkout -- <ruta>` (fuera del alcance de la skill).

## 13. Riesgos y límites

- **Coste de lectura:** una lista de 600 MB son ~10,3 M líneas; el censo tarda decenas de segundos y
  el modo muestra hace dos pasadas (estructura + detalle). Presupuestarlo.
- **Memoria:** el acumulador guarda un registro ligero por canal; los textos crudos de `#EXTHTTP` y
  del overflow se liberan al cerrar cada bloque. Una línea de >64 MiB aborta el run por diseño.
- **Inferencia de credenciales:** el par usuario/contraseña se infiere por la forma
  `/…/<user>/<pass>/<id>.ext`. En rutas no Xtream el conteo puede ser 0 y el enmascarado se apoya en
  las regex genéricas: se declara en `redaction`.
- **Sintaxis ≠ comportamiento:** `PASS` de `validate_filter_chain.js` sólo dice que el filtergraph
  se construye y produce frames.
- **Fuente sintética etiquetada:** el y4m del validador lleva `C420mpeg2`; cadenas `zscale` sin `*in`
  pueden comportarse distinto sobre un TS sin etiquetar. El propio JSON lo declara en
  `limitations[]`.

## 14. Métricas que la cartografía debe dejar medidas

| Métrica | Dónde | Criterio |
|---|---|---|
| Identidad (bytes + sha256) | `source` | siempre presente; sin ella el informe no vale |
| Idempotencia aritmética de bloques | `blocks.sum_check_exact` | `true` |
| Tallas distintas de bloque | `blocks.histogram` | explicadas por capas ausentes/extras |
| Vocabulario de tags | `tag_vocabulary.distinct` | censal, no muestral |
| Uniformidad por canal | divisiones enteras exactas | sin residuo |
| Firmas de filtros | `video_filter.distinct_chains` | `≪` nº de canales (si no, no hay plantilla) |
| Sintaxis de cadenas | `video_filter.syntax.status` | `PASS` / `FAIL` / `NO_COMPUTADO`, con defecto literal |
| `#EXTHTTP` válido | `exthttp.invalid` | 0 |
| Headers tóxicos | `exthttp.toxic_hits` | 0 distintos |
| Coherencia entre capas | `coherence.contradictions` | cada fila con conteo y % |
| Capacidad por runtime | `runtime_matrix.cells` | 0 celdas sin fuente ni estado |
| Huecos | `not_computed` | toda métrica no medida, con razón |
