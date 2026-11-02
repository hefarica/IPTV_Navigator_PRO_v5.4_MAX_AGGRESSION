# `tools/ape-demuxed` — Master HLS demuxed real: `#EXT-X-MEDIA` de audio + CERO caps de vídeo

**Qué hay aquí**

| Archivo | Rol |
|---|---|
| [`gen_demuxed_master.js`](gen_demuxed_master.js) | Generador. Node ≥ 18, **cero dependencias**. Cada regla documentada en el propio código con el hecho medido que la obliga. |
| [`FIXES.md`](FIXES.md) | **t9**: hueco → fix → evidencia, para los 3 huecos (credenciales, audio passthrough, veredictos de caps). |
| [`SECURITY.md`](SECURITY.md) | **t9**: los dos modos de credenciales, por qué el gate es dependiente del modo, y la prueba de preflight (el fichero no toca disco). |
| [`cap_verdicts.json`](cap_verdicts.json) | Veredictos de caps de **t10**. El generador anexa `prohibited[]` a sus reglas y consume `verdicts[]` sin traducir. |
| `examples/fixture_master_muxed.m3u8` | FIXTURE sintético: master muxed con caps prohibidos. |
| `examples/fixture_master_demuxed_source.m3u8` | FIXTURE sintético: master que ya declara `#EXT-X-MEDIA` de audio. |
| `examples/fixture_demuxed_master.OUTPUT.m3u8` | **Salida real del generador** sobre el fixture anterior (credenciales enmascaradas). |
| `examples/fixture_demuxed_master.OUTPUT.report.json` | Reporte real de esa corrida. |
| `examples/fixture_t9_credentials.m3u8` | FIXTURE t9: credencial **sintética visible** en el URI (para probar los dos modos). |
| `examples/fixture_t9_audio_passthrough.m3u8` | FIXTURE t9: `audio_eac3=false` con prioridad `eac3,…` (la contradicción medida). |
| `examples/fixture_t9_cap_candidates.m3u8` | FIXTURE t9: los 7 candidatos con sus valores reales medidos. |
| `examples/audio_renditions.schema-example.json` | **Esquema** de `--audio`. URIs en dominio reservado `.invalid`: no son datos de nadie. |
| `examples/reference_list_report.json` | **Corrida REAL** sobre `APE_LISTA_1793589060441.m3u8` (604.593.696 B, sha256 `523d52a6…5049d6`), modo catálogo, 10.573 canales. |

Los `fixture_*` son **sintéticos y están rotulados como tales en su primera línea de comentario**. Sirven para
ejercitar el transformador y sus rutas de fallo; **no** representan datos medidos de ningún proveedor.
`reference_list_report.json` sí es una medición real sobre la lista de referencia.

---

## 1. Qué arregla

1. **Emite `#EXT-X-MEDIA:TYPE=AUDIO`** por cada rendition de audio **real**, con `GROUP-ID`, `NAME`,
   `LANGUAGE`, `CHANNELS`, `DEFAULT`, `AUTOSELECT`, `CODECS` y `URI`.
2. **Respaldo estéreo**: si entre las renditions hay una de `CHANNELS="2"`, se emite como respaldo
   (`DEFAULT=NO, AUTOSELECT=YES`) — ahí **sí** se permite bajar canales/bitrate, porque la ley del operador
   solo prohíbe degradar **vídeo**.
3. **`AUDIO="<gid>"` en cada `#EXT-X-STREAM-INF`** y `CODECS=` reescrito con el códec de vídeo **real del
   origen** + los códecs del grupo de audio (deduplicados, orden preservado).
4. **Elimina los caps de vídeo** del master emitido (tabla de §4).
5. **Falla cerrado** si hay una variante por debajo de la fuente declarada (exit 3) o si el audio no se
   puede establecer sin inventar (exit 2 / 5).

Y algo que el enunciado no pedía pero que sin ello el resultado sería inútil: **preserva verbatim** los
~615-618 `#EXT-X-APE-*`, 25 `#EXT-X-CMAF-*`, 20 VNOVA y 18 PHANTOM por canal. No los borra (pueden ser
plano de control de un daemon) y **no afirma que hagan nada** (RFC 8216 §6.3.1: tag desconocido = se ignora).

---

## 2. Qué NO arregla — y por qué no puede

### 2.1 No crea renditions de audio que el origen no sirve

**Hecho medido:** `#EXT-X-MEDIA` = **0** en los 10.573 canales de la lista de referencia
(`docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md`, `03_HEADERS_MAP.md` §7). El origen es **muxed legacy**:
el audio viaja dentro del segmento de vídeo y no existe una URI de audio separada.

Una `#EXT-X-MEDIA` con `URI=` que apunte a un recurso inexistente **no es demuxed: es un 404 garantizado**.
El player pediría esa URI al arrancar el canal y fallaría.

Por eso el generador solo emite audio demuxed si hay **fuente de verdad**:

| Fuente | Cómo se detecta |
|---|---|
| `in_source` | el master de entrada **ya** declara `#EXT-X-MEDIA:TYPE=AUDIO` con `URI=` |
| `operator_json` | el operador entrega `--audio` con renditions y `evidence: probed \| in_source` |

Si no hay ninguna de las dos → **`AUDIO_RENDITIONS = NO_COMPUTADO`, exit 2, y no se escribe ni una URI**.
Con `--allow-muxed-passthrough` sale 0 pero el reporte dice `demuxed: false`: **nunca simula** que hay
demuxed.

**Resultado en la lista de referencia (corrida real):**

```json
"audio": {
  "source": null, "renditions": 0, "demuxed": false,
  "status": "NO_COMPUTADO",
  "reason": "#EXT-X-MEDIA TYPE=AUDIO con URI= = 0 en la entrada y no se aportó --audio; el origen es MUXED. No se inventa ninguna URI (anti-invención). Para audio demuxed real hay que aportar --audio con renditions medidas."
}
```

→ `exit 2`. **Ese es el resultado honesto: esta lista no se puede demuxar, solo se puede declarar que no
se puede.**

### 2.2 No produce el audio estéreo de respaldo

Emitir una rendition estéreo exige que **exista**: alguien tiene que transcodificar (permitido) y publicar
esa URI. Un generador de playlists no transcodifica. Sin una rendition real con `CHANNELS="2"`, el reporte
dice `stereo_fallback_present: false` y no se emite nada.

### 2.3 No verifica que una URI exista

**Límite duro y hay que decirlo:** el generador **no hace HTTP**. No puede comprobar que una URI responda
200. Lo único que hace es:

- **rechazar formas de fabricación**: URI vacía, no `http(s)`, o que contenga `<>`, `REAL_`, `PLACEHOLDER`,
  `TODO`, `CHANGEME`, `example.com`, `xxx`, etc. → exit 5;
- **exigir que el operador declare la evidencia** (`probed` / `in_source`). Si falta o es otra cosa → exit 5.

El campo `evidence` es una **afirmación del operador**, no algo que esta herramienta compruebe. La garantía
es del operador. Lo que el tool garantiza es que **no inventa por su cuenta**.

### 2.4 No capa el audio

Deliberado: la ley del operador permite bajar canales/bitrate en audio. El generador no toca
`audio_*` de `#KODIPROP`.

### 2.5 No pone `Access-Control-Allow-Origin`

**Hecho:** `Access-Control-Allow-Origin: *` está presente en la lista **servida**. Pero es una **cabecera de
respuesta HTTP**, no un tag HLS. Ningún generador de playlists puede emitirla; se configura en el servidor
(nginx `add_header`). Este script no la toca y **no la puede garantizar**: si el fichero generado se sirve
por otro camino sin esa cabecera, el CORS se pierde. Eso es capa de servidor, no de manifiesto.

### 2.6 No crea CMAF ni rellena el hueco de `#EXT-X-MAP`

**Hecho:** `#EXT-X-MAP` = **0** en toda la lista (`03_HEADERS_MAP.md` §6.0) ⇒ el CMAF es **declarativo**.
Este generador no fabrica segmentos ni init-segments; no añade `#EXT-X-MAP` porque no hay `moov` que
referenciar. Consecuencia: el master emitido sigue sin ser reproducible como CMAF, exactamente como el
original.

### 2.7 No convierte la lista en un HLS conforme

La lista de referencia es un **catálogo M3U Plus** de 10.573 canales con tags HLS dentro, no un master
conforme. El generador la trata en **modo catálogo** y emite una `#EXT-X-MEDIA` por canal con
`GROUP-ID="aud_<channelKey>"`. Un `GROUP-ID="aud"` global haría que todos los canales compartieran grupo y
el player elegiría una rendition de **otro** canal. En modo master (un solo flujo) sí se usa `aud`.

---

## 3. Uso

```bash
# 1) Diagnóstico sin escribir playlist (el modo barato para 604 MB)
node gen_demuxed_master.js --in <master.m3u8> --report-only --report report.json

# 2) Transformar (falla cerrado si no hay audio real)
node gen_demuxed_master.js --in <master.m3u8> --out <salida.m3u8> --report report.json

# 3) Aportando renditions de audio medidas
node gen_demuxed_master.js --in <master.m3u8> --audio audio.json --out <salida.m3u8>

# 4) Aceptar explícitamente que el audio quede muxed (sale 0, pero lo declara)
node gen_demuxed_master.js --in <master.m3u8> --out <salida.m3u8> --allow-muxed-passthrough
```

| Opción | Efecto |
|---|---|
| `--in <path>` | Entrada. Obligatorio. Detecta solo: catálogo si hay `#EXTINF`, master si no. |
| `--out <path\|->` | Salida (`-` = stdout). Sin `--out` y sin `--report-only` → exit 4. |
| `--audio <json>` | Renditions reales. Validación fail-closed (§5). |
| `--report <path>` | Reporte JSON machine-readable. |
| `--report-only` | Analiza y reporta; no escribe playlist. Ideal para la lista de 604 MB. |
| `--allow-muxed-passthrough` | Permite exit 0 dejando el audio muxed, declarándolo. |
| `--audio-group-id <id>` | `GROUP-ID` en modo master (default `aud`). |
| `--declared-source WxH@bps` | **Sube** el listón del fail-closed si la fuente real es mayor que la mejor variante. |
| `--caps limiting\|all` | `all` (default) quita siempre; `limiting` solo cuando el cap limita probadamente. |
| `--redact-credentials` | **Modo REDACTED**: enmascara usuario/password en toda la salida. La salida **no es reproducible** (para compartir/commitear). Ver [`SECURITY.md`](SECURITY.md). |
| `--mask-credentials` | Alias de `--redact-credentials` (compatibilidad con corridas previas). |
| `--enable-audio-passthrough` | Reactiva `inputstream.adaptive.audio_{eac3,ac3,dolby_atmos,dts,truehd}=false` **solo** si el códec está en la prioridad declarada. Sin flag no toca nada. |
| `--enable-eac3` | Alias de `--enable-audio-passthrough`. |
| `--force` | Permite sobrescribir la salida si ya existe (si no: exit 8). |
| `--quiet` | Sin resumen humano por stderr. |

### Códigos de salida

Un código = un significado. Tabla fijada por el capitán; el razón está en [`SECURITY.md`](SECURITY.md) §4 y
[`FIXES.md`](FIXES.md).

| Código | Significado |
|---|---|
| `0` | Demuxed emitido, o muxed con `--allow-muxed-passthrough` |
| `1` | `INTERNAL_INVARIANT` — defecto del programa (fuera de la tabla de política) |
| `2` | `AUDIO_NO_COMPUTADO` — no hay audio real y no se autorizó passthrough |
| `3` | `VIDEO_DOWNSCALE_VIOLATION` — una variante queda por debajo de la fuente declarada |
| `4` | `INPUT_MISSING` — falta entrada, ilegible/vacía o sin `#EXT-X-STREAM-INF` |
| `5` | `INVALID_EVIDENCE` — rendition sin evidencia válida (anti-invención) |
| `6` | `OUTPUT_PATH_INSIDE_REPO` — **gate de ruta**: destino dentro del repo git (preflight, no escribe) |
| `7` | *reservado — no usar* |
| `8` | `OUTPUT_EXISTS` — el destino ya existe y no se pasó `--force` |

---

## 4. Los caps de vídeo: qué se quita y qué **efecto real** tiene

La ley del operador prohíbe capar vídeo (resolución/bitrate/fps). Estos son los caps que el generador
elimina, con su **efecto medido** —que no siempre es el que la línea sugiere:

| Línea | Efecto real | Base |
|---|---|---|
| `#KODIPROP:inputstream.adaptive.max_resolution` | **Cap real en Kodi** (clave del addon) | `04_LANE_CAPABILITY_MATRIX.md` §6.5 |
| `#KODIPROP:inputstream.adaptive.max_bitrate` | Cap real en Kodi — **no aparece en esta lista (0)** | medición propia |
| `#KODIPROP:inputstream.adaptive.max_framerate` | Cap real en Kodi | ídem |
| `#EXTVLCOPT:adaptive-maxbitrate` | **INERTE en VLC**: el nombre no existe en ningún binario | `tools/ape-image-recipes/VLC_OPT_AUDIT.md` |
| `#EXTVLCOPT:adaptive-maxwidth` | **INERTE en VLC** | ídem |
| `#EXTVLCOPT:adaptive-maxheight` | **INERTE en VLC** | ídem |
| `#EXTVLCOPT:video-width` | **INERTE en VLC** | ídem |
| `#EXTVLCOPT:video-height` | **INERTE en VLC** | ídem |

> **La verdad incómoda:** de 138 nombres de opción `#EXTVLCOPT` distintos, **80 (58 %)** no existen en VLC;
> entre ellos **toda** la familia `adaptive-*` y `video-width/height`. VLC las descarta **en silencio**: no
> dejan una línea de log. Por tanto quitar `adaptive-maxbitrate`/`video-width`/`video-height` **no levanta
> ningún techo real en VLC** — levanta un techo **declarado**. Se quitan por verdad (no prometer lo que no
> se aplica) y por ley, no porque VLC estuviera capando. El cap que sí muerde es el de Kodi.

### Desglose real sobre los 10.573 canales (corrida medida)

**84.584 líneas de cap eliminadas** = **74.011** (8 claves de t7, una de ellas sin ocurrencias) **+ 10.573**
de `cap_verdicts.json` (t10, `chooser_bandwidth_max`). Ver [`FIXES.md`](FIXES.md) HUECO 3.

| Clave | Presente | Limita | No limita | Valores observados |
|---|---:|---:|---:|---|
| `#KODIPROP:inputstream.adaptive.max_resolution` | 10.573 | **10.573** | 0 | `1920x1080`×10.573 |
| `#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` | 10.573 | **10.573** | 0 | `8000000`×9.765 · `19800000`×808 |
| `#EXTVLCOPT:adaptive-maxbitrate` | 10.573 | **10.573** | 0 | `8000000`×9.765 · `19800000`×808 |
| `#EXTVLCOPT:video-width` | 10.573 | **9.765** | 808 | `1280`×7.457 · `1920`×2.308 · `3840`×808 |
| `#EXTVLCOPT:video-height` | 10.573 | **9.765** | 808 | `720`×7.457 · `1080`×2.308 · `2160`×808 |
| `#KODIPROP:inputstream.adaptive.max_framerate` | 10.573 | **1.185** | 9.388 | `30`×7.457 · `60`×3.116 |
| `#EXTVLCOPT:adaptive-maxwidth` | 10.573 | **0** | 10.573 | `7680`×10.573 |
| `#EXTVLCOPT:adaptive-maxheight` | 10.573 | **0** | 10.573 | `4320`×10.573 |

Totales: **52.434 limitaban de verdad**, **32.150 no limitaban nada**, **0 indeterminados**.
Por efecto: **52.865 inertes en VLC**, **31.719 claves reales de Kodi** (21.146 + 10.573).
Por fuente de regla: `{"t7-VideoCapRules":74011, "cap_verdicts.json":10573}`.

> **Aviso de scope.** Hay dos corridas y **no** son el mismo número: la muestra
> `scratch/…/live_corrected/sample_in.m3u8` tiene **1 bloque** (141 KB) y ahí se quitan **8** caps de vídeo;
> las cifras de esta tabla son de la corrida **completa** sobre los **604 MB**. No mezclar ambos scopes.

**Lo que esto corrige del enunciado de la tarea** (medido con `rg`, no inferido):

1. `max_resolution=1920x1080` en 10.573 canales → **CONFIRMADO**.
2. `adaptive-maxbitrate=8000000` "en 9.765 canales" → **la opción está en 10.573**. El **valor** `8000000`
   está en 9.765; los otros **808** llevan `19800000`. Presencia ≠ valor.
3. `video-width/height` "1280×720 en 7.457 y 1920×1080 en 2.308" → **la opción está en 10.573**. Hay un
   **tercer valor**: `3840×2160` en 808 canales (que **no** piden salida reducida).
4. `inputstream.adaptive.max_bitrate` → **no existe en la lista (0 ocurrencias)**. La regla está y es no-op.
5. `adaptive-maxwidth=7680` / `maxheight=4320` en 10.573 → **no limitan nada** (8K > 4K). Ruido declarativo.
6. `adaptive-maxbw=999999999` en 10.573 → no limita. Reportado como candidato, no eliminado.
7. `chooser_bandwidth_max` = `8000000` (9.765) / `19800000` (808) → candidato, **no** eliminado (fuera del
   mandato explícito). El operador decide.
8. `preferred_video_resolution=2160` en 10.573 → **no es un cap**, es una preferencia. Candidato, no eliminado.
9. `max_framerate=30` en 7.457, pero **1.185** de esos canales declaran `FRAME-RATE=60.000` en su
   `#EXT-X-STREAM-INF`: ahí el cap sí muerde y contradice la variante.

### Candidatos detectados y **no** eliminados

`adaptive-bandwidth-factor`, `adaptive-maxbw`, `video-fps`, `video-display-fps`,
`inputstream.adaptive.chooser_bandwidth_max`, `inputstream.adaptive.max_buffer_duration`,
`inputstream.adaptive.preferred_video_resolution` — 10.573 cada uno.
Se reportan en `video.candidates_not_removed` para que el operador decida: **cambiar comportamiento no
pedido es riesgo**, y algunos no son caps. Usa `--caps all` + edición manual si quieres ir más allá.

---

## 5. `--audio`: esquema y validación fail-closed

```json
{
  "renditions": [
    {
      "uri": "https://<host>/audio/<...>/1001_es_eac3.m3u8",
      "codec": "ec-3",
      "channels": "6",
      "language": "spa",
      "name": "EAC3 5.1",
      "default": true,
      "autoselect": true,
      "evidence": "probed"
    },
    {
      "uri": "https://<host>/audio/<...>/1001_es_stereo.m3u8",
      "codec": "mp4a.40.2",
      "channels": "2",
      "language": "spa",
      "name": "AAC estereo",
      "default": false,
      "autoselect": true,
      "role": "fallback",
      "evidence": "probed"
    }
  ]
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `uri` | sí | `http(s)://`, sin marcadores de placeholder |
| `codec` | sí | Cadena RFC 6381 (`ec-3`, `mp4a.40.2`, `ac-3`, `opus`…) |
| `channels` | sí | `"2"`, `"6"`, `"8"`… |
| `evidence` | sí | `probed` \| `in_source`. Cualquier otra cosa → **exit 5** |
| `language`, `name` | no | `LANGUAGE`/`NAME` del tag |
| `default`, `autoselect` | no | `DEFAULT`/`AUTOSELECT` |
| `role: "fallback"` | no | Marca la rendition estéreo de respaldo |

**Una sola rendition inválida aborta todo** (exit 5). No se emite "lo válido y se ignora el resto": un grupo
de audio a medias es peor que ninguno, porque el player puede elegir la rendition que falta.

---

## 6. Garantías de forma del manifiesto emitido

Comprobado en `examples/fixture_demuxed_master.OUTPUT.m3u8`:

| Invariante | Verificación |
|---|---|
| `#EXTM3U` es la **primera** línea | medido: `primera_linea_es_EXTM3U = True` |
| `#EXT-X-MEDIA` va **antes** del `#EXT-X-STREAM-INF` que la referencia | medido: media L13 < stream L15 |
| **0** caps de vídeo residuales | medido: `caps_residuales = 0` |
| `AUDIO="aud"` añadido al STREAM-INF | medido en la salida |
| `CODECS` = vídeo real + audio del grupo | `hvc1.2.4.L153.B0,ec-3,mp4a.40.2` |
| `#EXT-X-MEDIA` del origen **reemplazada**, no duplicada | 2 líneas de entrada → 2 de salida, `GROUP-ID` reescrito |
| Etiquetas APE/CMAF/VNOVA/PHANTOM preservadas | copia verbatim |
| `#EXTINF`, `tvg-*` y el orden del bloque intactos | copia verbatim |

**Trampa evitada a propósito:** el bloque **no** se delimita por un número fijo de líneas. En esta lista el
URI **no es la última línea**: le siguen `#EXTVLCOPT:clock-jitter=0` y `#EXT-X-APE-CRYSTAL-UHD`
(`lines_after_uri = 3` en 10.572 canales, **7** en el último). Un parser que cierre el bloque en el URI
pierde 2 tags por canal. Aquí se delimita por `#EXTINF` (catálogo) o por inicio de fichero (master).

**Otra trampa evitada:** `BANDWIDTH=` por regex también captura `AVERAGE-BANDWIDTH=` (19.530 coincidencias
falsas si se cuenta ingenuamente). El generador parsea la lista de atributos con comillas, no con regex.

---

## 7. Corrida real sobre la lista de referencia

```
$ node gen_demuxed_master.js --in APE_LISTA_1793589060441.m3u8 --report-only --report reference_list_report.json
modo=catalogue  bloques=10573  STREAM-INF=10573
audio: NO_COMPUTADO (sin fuente, 0 rendition(s))
caps de vídeo quitados: 74011  limitaban=41861 no_limitaban=32150 indeterminado=0
violaciones de downscale: 0
exit=2 audio no computado y sin --allow-muxed-passthrough
```

| Métrica | Valor |
|---|---|
| Entrada | 604.593.696 B · sha256 `523d52a6…5049d6` |
| Tiempo | **≈ 11 s** (un pase, streaming, memoria acotada) |
| Bloques (canales) | **10.573** |
| `#EXT-X-STREAM-INF` | 10.573 → **1 por canal** |
| `#EXT-X-I-FRAME-STREAM-INF` | 10.573 (no cuenta como variante de reproducción) |
| `#EXT-X-MEDIA` con URI | **0** |
| Códecs vistos en STREAM-INF | `hvc1.2.4.L153.B0` ×10.573 · `mp4a.40.2` ×10.573 |
| Caps eliminados | **84.584** (74.011 t7 + 10.573 `cap_verdicts.json`) |
| Veredictos de candidatos | **7/7** — `{cap_de_video:1, inocuo_para_vlc:5, indeterminado:1}` |
| Violaciones de downscale | **0** (1 variante por canal ⇒ no hay escalera que baje) |
| Veredicto | **exit 2 — `AUDIO_NO_COMPUTADO`** |

**La lista no se toca:** el script solo lee. La corrida de ejemplo es `--report-only` (no escribe playlist).

---

## 8. Límites (fail-honest)

1. **`evidence` no se verifica por HTTP.** El tool no hace red. Solo rechaza placeholders y exige que el
   operador declare. La existencia real de una URI es responsabilidad del operador.
2. **No hay medición de reproducción.** Nadie ejecutó ExoPlayer/hls.js/VLC contra la salida. Que el
   manifiesto sea formalmente correcto (media antes de stream-inf, `AUDIO=` enlazado, `CODECS` coherente) es
   **declarado**, no **verificado en runtime**.
3. **El efecto de los caps de Kodi no se re-midió aquí.** Que `inputstream.adaptive.max_resolution` sea una
   clave del addon se apoya en la matriz de carriles (§6.5) y en la doctrina del repo; no se ejecutó Kodi.
4. **`real-world audio` no probado.** Los fixtures usan `.invalid`; ninguna corrida tocó una rendition de
   audio real de un proveedor. La ruta `--audio` está probada en forma, no en sustancia.
5. **Modo catálogo = 10.573 grupos de audio distintos** si algún día hay audio real. Eso es 10.573 × N URIs
   nuevas que un cliente podría pedir. **Riesgo anti-509**: recuerda que el upstream de esta lista usa 1
   conexión por canal. Añadir renditions multiplica peticiones; el generador no gestiona ese límite, solo lo
   hace visible. No se puede celebrar el demuxed sin mirar el 509.
6. **`#EXT-X-MEDIA` y VLC: no medido.** Los lectores de HLS estándar (ExoPlayer/Media3, hls.js) sí leen
   `EXT-X-MEDIA` según la matriz; para VLC no hay medición en este repo y **no se afirma**.
7. **Un `GROUP-ID` por canal no es lo que un master HLS normal haría.** Es la consecuencia inevitable de
   aplicar el transformador a un catálogo. En un master de un solo flujo el grupo es `aud`, como pide el
   enunciado.

---

## 9. Estados de evidencia usados

Siguiendo `ape-image-pipeline-truth` §13:

- **declarado** — lo que este generador **escribe** (todo el manifiesto emitido es declarado).
- **observado** — lo medido con `rg` sobre la lista real (§4, §7).
- **verificado** — solo las invariantes de forma de §6, reproducidas por comando.

Nada de lo emitido está **aplicado**: un tag en una playlist no se ejecuta por estar escrito.
