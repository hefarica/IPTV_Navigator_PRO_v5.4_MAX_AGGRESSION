# references.md — fuentes y estado de verificación

Regla: una fuente **consultada** va con su URL y qué se tomó de ella. Una fuente **no consultada**
se declara y no se usa como evidencia.

## Artefactos propios (verificados)

| Artefacto | Qué aporta | Estado |
|---|---|---|
| `APE_LISTA_1793589060441.m3u8` (604.593.696 B, sha256 `523d52a6…5049d6`) | la lista de referencia | hash verificado |
| `https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8` | réplica servida | `Content-Length` idéntico ⇒ byte-idéntica |
| `docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md` + `.json` | estructura censal (t1) | entregado |
| `docs/cartography/APE_LISTA_523d52a6/02_VIDEO_FILTER_MATRIX.md` + `.json` | cadenas, rangos, fps medidos (t2) | entregado |
| `docs/cartography/APE_LISTA_523d52a6/03_HEADERS_MAP.md` + `.json` | EXTHTTP/KODIPROP/CMAF (t3) | entregado |
| `scratch/avisynth_probe_2026/lab_decoded/lab_metadata.json` | LAB decodificado, 51.890 B | generado por `decode_lab_metadata.js` |
| `scratch/avisynth_probe_2026/vlc_chain_list_style.log` | rechazo de la sintaxis de la lista por VLC | log literal |
| `scratch/avisynth_probe_2026/vlc_opt_*.log`, `vlc_opt2_*.log` | carga de módulos y opciones aceptadas | log literal |
| `scratch/avisynth_probe_2026/vlcopt_audit.json` | 58 presentes / 80 ausentes | generado por `audit_vlcopt.js` |

## Binarios consultados (medidos localmente)

- `ffmpeg` 8.0.1-full_build (gyan.dev), con `libplacebo`, `zscale`, `libvmaf`. Salida de
  `ffmpeg -version` y `ffmpeg -h filter=<nombre>` capturada en `scratch/…/help_*.txt` (t2).
- VLC `C:\Program Files\VideoLAN\VLC` — 365 `.dll`/`.exe`, 150.121.508 B escaneados.
  41 plugins `video_filter`, **0** con token `avfilter`.
- Versión de VLC reportada por t2: **3.0.24**.

## Fuente externa consultada

| Fuente | Qué se tomó | Límite |
|---|---|---|
| [OTT Navigator Changelog (canónico)](https://ottnav.github.io/changelog.html) | motor **VLC 3.6.4** embebido; `user agent support (in #EXTVLCOPT)`; `#EXTVLCOPTS:http-referrer`; `added more support for #KODIPROP tags`; `support for #EXTATTRFROMURL tag`; **cero menciones a video filters** | es un changelog: prueba qué **parsea**, no qué **ejecuta** en píxeles |
| [OTT Navigator Changelog en Telegram](https://t.me/s/ottnav) | misma confirmación de `#EXTVLCOPT` para user-agent | duplica la fuente anterior |

## Fuentes NO consultadas (no usar como evidencia)

- RFC 8216 (texto) — se cita **por conocimiento normativo** de §6.3.1 (tags desconocidos se
  ignoran). No se descargó ni se verificó línea por línea en esta sesión.
- Documentación oficial de zimg / zscale sobre ausencia de `bt1886` — se estableció
  **empíricamente** (el parser lo rechaza), no por la doc.
- Documentación de Media3/ExoPlayer sobre `#EXT-X-SESSION-DATA` — no consultada; el veredicto
  sobre su consumo es normativo, no medido.
- Cualquier foro, blog o video sobre "mejorar imagen en VLC" — no consultado, no usado.

## Aportes del equipo que esta skill incorpora

| Aporte | Autor | Contenido |
|---|---|---|
| Refutación de `me` | t2 | `me` existe (1..9); el fallo era `scd=5` |
| Defecto universal | t2 | `unsharp chroma_msize_x=0` (rango [3..23]) |
| Fps medidos | t2 | P4 452,6 · P3 241,3 · P1 **29,6** |
| Ausencia de P5 | t2 | 0 instancias; solo P4/P3/P1 |
| Layout del bloque | t1 | URI + 2 tags + vacía |
| `bt1886` case-sensitive | t1 | `BT.1886` = 12.043 case-insensitive |
| Conteos por canal | t3 | 134 / 103 / 54 |
| Cap de EXTHTTP | t3 | 200 **campos**, no 8.192 bytes |
| [[#EXT-X-MAP]] = 0 | t3 | no hay CMAF real |

## Registro de correcciones

Ver `tools/ape-image-recipes/CORRECTIONS.md`: seis afirmaciones propias refutadas, con quién las
refutó y el artefacto. Se mantiene para que no vuelvan a circular.
