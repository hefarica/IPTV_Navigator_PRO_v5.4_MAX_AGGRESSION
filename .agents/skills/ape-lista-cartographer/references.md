# references.md — ape-lista-cartographer

**Regla de esta skill:** sólo se cita lo que se abrió y se leyó. Lo que no se consultó se declara
como **no consultado**, con la razón. Esta sesión trabajó **sin red**.

## 1. Fuentes internas consultadas en esta sesión (leídas)

| # | Fuente | Qué se tomó | Cómo se usó |
|---|---|---|---|
| R1 | [`docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md`](../../../docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md) | identidad del artefacto, delimitación del bloque por `#EXTINF`, 8 tallas de bloque, censo de 819 tags, 5 fixtures, §10 (verificación de cifras previas) y §11 (NO COMPUTADO) | modelo de los pasos 1–3 y del `blocks.sum_check` |
| R2 | [`docs/cartography/APE_LISTA_523d52a6/02_VIDEO_FILTER_MATRIX.md`](../../../docs/cartography/APE_LISTA_523d52a6/02_VIDEO_FILTER_MATRIX.md) | 3 firmas de cadena, el defecto universal `unsharp chroma_msize_x=0`, la cascada de `zscale`/`minterpolate`, el veredicto VLC, los límites (§11) | modelo de los pasos 5 y de `validate_filter_chain.js` |
| R3 | [`docs/cartography/APE_LISTA_523d52a6/03_HEADERS_MAP.md`](../../../docs/cartography/APE_LISTA_523d52a6/03_HEADERS_MAP.md) | `#EXTHTTP` como JSON, el cap real de 200 campos vs 8.192 B, overflow base64, los 6 tóxicos + lookalikes, la matriz de coherencia C1–C13, §10 (no medido) | modelo de los pasos 6 y 7 |
| R4 | [`docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md`](../../../docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md) | matriz runtime × etapa con códigos N/P/D/I y calidad m/r/s/x, `unsafe option "video-filter"`, módulos VLC reales y nombres de opción, reglas de emisión (§7), límites (§11) | modelo del paso 8 y `RUNTIME_TABLE` del mapper |
| R5 | `AGENTS.md` y `CLAUDE.md` del repo | doctrina de los headers PROHIBIDOS (los 6 tóxicos), GOLDEN RULE `hvc1`/`hev1`, Ley Cardinal 1 (Nivel↔Resolución), Ley Anti-Degradación, realidad medida del VPS | definición de tóxico, de violación de la regla de oro y de la fila VPS de la matriz |
| R6 | [`.agents/skills/ape-image-pipeline-truth/SKILL.md`](../ape-image-pipeline-truth/SKILL.md) (encabezado y tesis) | la tesis "el manifiesto es plano de control, no ejecutor de píxeles" y los 4 fallos que esa skill previene | encuadre de §9 reglas de oro; esta skill es su instrumento de medición |
| R7 | [`.agents/skills/iptv-hls-validator/SKILL.md`](../iptv-hls-validator/SKILL.md), `install.lock.json`, `audit-report.md` | convención del repo: frontmatter + 14 secciones, 8 archivos + 3 directorios, forma de `install.lock.json` y `audit-report.md` | plantilla de esta skill |
| R8 | `scratch/avisynth_probe_2026/fixtures/canal_001.txt` | bloque real de un canal (anonimizado) usado como caso de prueba del parser | fixture heredado de R1; el fixture propio se genera con `--fixture` |
| R9 | `scratch/lane_matrix_04/literals/P1_nlmeans30.txt`, `P3_nlmeans25.txt`, `P4_hqdn3d.txt` | las tres cadenas exactas de la lista de referencia | casos T4–T6 |

## 2. Medido en esta sesión (no citado de terceros)

| # | Medición | Artefacto |
|---|---|---|
| M1 | `ffmpeg -h filter=unsharp/minterpolate/zscale` → rangos y tipos reales | salida de `ffmpeg 8.0.1-full_build-www.gyan.dev` (ver `reports/`) |
| M2 | `unsharp chroma_msize_x=0` fuera de `[3..23]`; `minterpolate scd=5` fuera de `[0..1]`; `zscale transfer=st2084` → `Undefined constant` | `validate_filter_chain.js` sobre R9 |
| M3 | `vlc.exe --version` **bloquea** la consola en Windows (>120 s, proceso vivo) | observación directa; por eso el mapper no lo invoca |
| M4 | VLC 3.0.24 con **41** DLL en `plugins/video_filter` y **0** binarios `avfilter`/`ffmpeg` | `environment.vlc` del JSON emitido |
| M5 | Cartografía muestra (250 canales) de la lista de referencia | `reports/map_<sha8>.json` / `.md` |

## 3. Fuentes externas: NO consultadas (sin red)

Declaradas para que nadie las atribuya a esta skill:

| Fuente | Estado | Nota |
|---|---|---|
| RFC 8216 (HTTP Live Streaming), en particular §4.2 (attribute lists) y §6.3.1 (tags desconocidos se ignoran) | **no consultado en esta sesión** | se usa a través de R4, que lo cita; el parser de esta skill implementa la gramática por comportamiento observado (comas para HLS, espacios para M3U Plus) |
| RFC 6381 (codec strings) | **no consultado** | la GOLDEN RULE `hvc1`/`hev1` se toma de R5 (doctrina del repo) |
| Documentación oficial de ffmpeg (`filters.texi`) | **no consultada** | los rangos se obtienen del binario (`ffmpeg -h`), que es la fuente que manda en esta máquina |
| Wiki/documentación de VLC (`--video-filter`, módulos, filtro de opciones "unsafe") | **no consultada** | el comportamiento viene de R4, medido con el binario 3.0.24 |
| Documentación de zimg/zscale | **no consultada** | los nombres de constante se validan ejecutando |
| SMPTE ST 2084 / BT.2100 / BT.1886 | **no consultadas** | sólo se reportan como **valores declarados** por la lista, no como conformidad |
| `tools/ape-image-recipes/VLC_OPT_AUDIT.md` | **existe en el repo, no leído en esta sesión** | citado por R4; su contenido no se usa como evidencia aquí |

## 4. Nota de método

Cuando una cifra de esta skill no coincide con R1–R4, **no se "corrige" el informe citado**: se
reporta la diferencia con el comando que la produce. La cartografía previa es evidencia fechada, no
dogma; y esta skill existe justamente para poder re-medirla.
