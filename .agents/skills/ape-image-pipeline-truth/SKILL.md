---
name: ape-image-pipeline-truth
description: Verdad medida del pipeline de imagen de APE (LAB → JSON → M3U8 → VPS → ARA) y del recetario de filtros por runtime. Úsala SIEMPRE que se toque un recetario de imagen, un `#EXTVLCOPT:video-filter`, una cadena ffmpeg, una declaración HDR/códec de variante, o se afirme que un filtro "se aplica" en VLC, OTT Navigator, TiviMate, ExoPlayer o Kodi. Contiene los módulos VLC que existen de verdad, los rangos reales de ffmpeg 8.0.1, el único parámetro que rompe las 10.573 cadenas de la lista de referencia, el layout real del bloque de canal, y los seis errores ya cometidos que NO deben repetirse.
---

# APE Image Pipeline Truth — super-skill

> **Tesis:** el manifiesto es un **plano de control**, no un ejecutor de píxeles. Un string de
> filtros en la playlist solo ejecuta si (a) el motor es VLC y (b) la sintaxis es de **módulo VLC**.
> Todo lo demás es metadata inerte o mentira al parser.

## 1. Para qué existe esta skill

Impedir que se repita cualquiera de estos fallos, todos cometidos y pagados en la sesión del
2026-11-02:

1. Aceptar cadenas de filtros que **no parsean**.
2. Afirmar que un filtro **se aplica** porque está escrito en la playlist.
3. Citar una opción de VLC que **no existe**.
4. Contar un bloque de canal con un **tramo fijo** en vez de con su delimitador real.
5. Leer un **0 por case-sensitivity** como ausencia.
6. Atribuir un fallo de parser al **parámetro equivocado**.

## 2. Cuándo se activa

- Se va a emitir, editar o auditar `#EXTVLCOPT`, `#KODIPROP`, `#EXT-X-STREAM-INF`, un recetario
  de imagen, un perfil P0–P5, o metadata HDR/códec.
- Alguien dice "aplícalo para VLC / OTT Navigator / ExoPlayer / TiviMate / Kodi".
- Se va a declarar un beneficio de calidad de imagen.
- Se toca el LAB Excel, el generador, el VPS o ARA en la ruta de imagen.

## 3. Verdad medida — artefacto de referencia

`APE_LISTA_1793589060441.m3u8` · 604.593.696 B · sha256 `523d52a6…5049d6`.
Réplica servida en `https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8`
(**byte-idéntica**, verificado por `Content-Length`).

| Hecho | Valor | Fuente |
|---|---|---|
| Líneas | 10.315.662 | t1 / `01_STRUCTURE.md` |
| Canales | 10.573 | t1 |
| Cabecera | 187 líneas de tag + vacía en 188; primer `#EXTINF` en 189 | t1 |
| Bloque | min 954 · p50 976 · media 975,643 · máx 981 | t1 |
| Perfiles en uso | **P4=7.457 · P3=2.308 · P1=808** — **NO existe P5** | t2 |
| Vocabulario | 819 tags distintos | t1 |
| `#EXTHTTP` | 10.573/10.573 JSON válido; corte a **200 campos** (no 8.192 B); 0 tóxicos | t3 |
| `#EXT-X-MAP` | **0** → no hay CMAF real | t3 |
| URL por canal | 1,000 exacto | t3 |
| Tag de ADN | `#EXT-X-APE-LAB-DNA:sha256=unverified` | t1 |

## 4. Cómo viaja el recetario (mecanismo real, decodificado)

La cabecera embebe el LAB en **20 chunks base64** del **mismo** string:

```
#EXT-X-APE-LAB-METADATA:<i>/20:<chunk>
```

Se **concatenan en orden y se decodifican una sola vez** → **51.890 B** de JSON,
`schema: ape-lab-metadata-v1`, con `fields` de 25 claves: `settings`, `vlcopt`, `kodiprop`,
`headerOverrides` (24,5 KB), `prefetch_config`, **`quality_levels`**, `headers` (12,9 KB),
`hlsjs`, `bounds`, `optimized_knobs`, `fitness`, `player_enslavement` (`level_1_master_playlist`,
`level_3_per_channel`), `actor_injections` (panel/player/os/network/iptv_server/**soc_vpp_dnr**).

`fields.quality_levels` = **L1…L7**, cada uno con `video_filter`. El `video-filter` de cada canal
**es** `quality_levels[Lx].video_filter` (+ `minterpolate` en el perfil maestro).

| Nivel | Res | Mbps | HDR | Cadena (forma) |
|---|---|---|---|---|
| L1 GOD_TIER_8K | 7680×4320 | 200 | hdr10plus | nlmeans s3.0 p7 r15 · bwdif · gradfun r16 s1.0 · unsharp 0.4 · zscale st2084/bt2020 |
| L2 SUPREME_4K | 3840×2160 | 100 | hdr10 | = L1 |
| L3 ULTRA_1080P | 1920×1080 | 40 | hdr10 | nlmeans 2.5/5/11 · gradfun r12 s0.8 · unsharp 0.3 · zscale bt709 |
| L4 HIGH_720P | 1280×720 | 20 | hlg | hqdn3d · yadif · unsharp 0.25 |
| L5 STANDARD_480P | 854×480 | 10 | sdr | `yadif=mode=0` |
| L6 / L7 | 360p / 240p | 4 / 1.5 | sdr | vacío (failsafe) |

Firmas por canal (biyección firma↔perfil): **S1** hqdn3d+yadif (P4) · **S2** nlmeans+bwdif+gradfun+zscale bt709 (P3) · **S3** nlmeans s3.0 + `transfer=st2084` (P1).

## 5. El modelo de tres carriles

| Carril | Qué consume | Quién lo ejecuta | Verdad |
|---|---|---|---|
| `vlc` | `#EXTVLCOPT:video-filter=<módulos VLC>` | libVLC (desktop, o **el motor VLC embebido de OTT Navigator 3.6.x**) | solo módulos reales y con sintaxis `nombre{opt=val}` |
| `ffmpeg` | `-lavfi <filtergraph>` | LAB / VPS en transcode | ejecuta de verdad, pero **no es tiempo real** a 4K+ |
| `manifest` | JSON compacto en la playlist | nadie lo ejecuta; es plano de control para daemon/ARA | metadata declarativa |

**Regla de oro:** nunca "arreglar" un carril escribiendo la sintaxis de otro.

### 5.1 · Coste del demuxed (t7): no es gratis, y puede matar canales

`#EXT-X-MEDIA` de audio multiplica peticiones: **canales × renditions de audio**. Contra un
upstream de **1 conexión por canal**, eso es el terreno del **HTTP 509 (Bandwidth Limit Exceeded)**.

Antes de recomendar demuxed hay que declarar **para qué runtime** y **con qué coste de conexiones**.
El generador lo hace *visible* (reporta el conteo); **no puede gestionarlo**.

Y el techo real a recordar: el demuxed solo es posible si existe una **rendition de audio real**.
`#EXT-X-MEDIA` = 0 en la lista de referencia ⇒ muxed legacy ⇒ demuxed es `NO_COMPUTADO` en directo
sin un packager en el camino (y el VPS es metadata-only).

## 6. VLC — lo que existe y lo que no (medido)

**VLC 3.0.24, Windows, 365 binarios / 150 MB escaneados.**

### Módulos de filtro verificados (carga confirmada en log)

| Cadena | Veredicto |
|---|---|
| `gradfun{strength=1.5,radius=8}` | ✅ carga |
| `deinterlace{mode=yadif2x}` | ✅ carga (`deinterlace-mode` es **rechazada**) |
| `sharpen{sigma=0.5}` | ✅ carga |
| `hqdn3d{luma-spat=2.0,chroma-spat=1.5,luma-temp=3.0,chroma-temp=2.5}` | ✅ carga · las opciones **abreviadas** funcionan · rechaza `luma_spatial`, `luma-spatial` y `luma_tmp` |

### NO son módulos de VLC

`nlmeans` · `bwdif` · `yadif` · `zscale` · `minterpolate` · `unsharp` · `cas` · `libplacebo` · `pp` · `ffmpeg{…}`

No hay **plugin avfilter**: 41 plugins `video_filter`, 0 con token `avfilter`, 0 DLL avfilter/ffmpeg.

### ⛔ EL BLOQUEO REAL: `video-filter` está cerrado por POLÍTICA (t4)

No es sintaxis. Es una lista blanca de seguridad de VLC para opciones venidas de un **ítem de
playlist**. Medido por t4 en VLC 3.0.24:

```
main error: unsafe option "video-filter" has been ignored for security reasons
```

0 filtros instanciados, **el canal reproduce igual**. `avcodec-hw` cae en la misma lista negra.

**Consecuencia que manda sobre todo el diseño:** `#EXTVLCOPT:video-filter=…` es **inerte por
política**, no por nombre de módulo. Cambiar a sintaxis de módulo, a `:` o a `{}` **no lo arregla**.
El único camino que ejecuta filtros en VLC es la **línea de comandos** (`vlc --video-filter=…`),
no la playlist. Artefacto: `scratch/lane_matrix_04/vlc_bc/DBG.log`.

### Separador correcto (refuta mi lectura anterior)

| Separador | Efecto medido |
|---|---|
| **`:`** | separa módulos → `hqdn3d{…}:gradfun{…}:sharpen{…}` carga los tres |
| **`,`** | **NO** separa módulos → carga solo el primero |

Cadena válida por CLI:
`hqdn3d{luma-spat=2.0,chroma-spat=1.5,luma-temp=3.0,chroma-temp=2.5}:gradfun{radius=12,strength=0.8}:sharpen{sigma=0.5}`

Mi conclusión previa («aborta por `Too high level of recursion`») estaba **mal atribuida**: t4 midió
98 avisos pero decoder + EOF en **30/30** corridas; no aborta. La causa real de que solo cargara el
primer módulo es el separador.

### Firma del rechazo equivalente (cadena ffmpeg en playlist)

```
main debug: Adding 'nlmeans=s=2.5' as interactive
main debug: looking for video filter module matching "nlmeans=s=2.5,chain": 48 candidates
main debug: no video filter modules matched
main error: Failed to create video filter 'nlmeans=s=2.5'
```

Con **`,`** cada `key=value` se vuelve un pseudo-módulo: una cadena de la lista genera **11**
`Failed to create video filter` y el archivo **sigue reproduciendo** → filtra **nada**. Y aun con
el separador correcto, la playlist no lo ejecuta: `unsafe option` (§6).

### Opciones `#EXTVLCOPT` que VLC NO conoce

De **138** nombres distintos en la lista, **80 (58 %) no existen** en ningún binario.
Familias completas inexistentes: `adaptive-*` (36, incluidas las 23 `adaptive-reload-use-*`),
`hls-*` (10), `http-*`/`network-*` de reconexión (9), `ts-*` (7) y la declarativa
`video-hdr*`/`video-bt2020`/`video-width|height|fps|zoom` (17).

**Las 58 reales** incluyen: `network-caching`, `video-filter`, `saturation`, `tonemap`,
`colorspace`, `format`, `live-caching`, `file-caching`, `clock-jitter`, `clock-synchro`,
`http-user-agent`, `http-referrer`, `avcodec-hw`, `avcodec-threads`, `audio-*`, `sub-*`.

Artefacto: `tools/ape-image-recipes/VLC_OPT_AUDIT.md` + `audit_vlcopt.js`.

## 7. ffmpeg 8.0.1 — rangos reales

| Elemento | Verdad |
|---|---|
| `pp` | **no existe** (`No such filter: 'pp'`) |
| `gradfun.strength` | **[0.51, 64]** — todo valor menor es inválido |
| `gradfun.radius` | [4, 32] |
| `unsharp.chroma_msize_x/y` | **[3, 23]** — **`0` rompe la cadena** |
| `minterpolate.me` | **existe**: int 1..9, default `epzs`. `umh` y `tss` son válidos |
| `minterpolate.me_mode` | int 0..1 |
| `minterpolate.scd` | int 0..1 (**no** 5) |
| `minterpolate.scd_threshold` | double 0..100 |
| `zscale.dither` | none · ordered · random · error_diffusion (**no** blue-noise) |
| `zscale.filter` | point · bilinear · bicubic · spline16 · spline36 · lanczos (**no** compound) |
| `zscale.transfer` | **no hay `bt1886`**; para SDR usar `709` |
| `zscale=transfer=linear` | aborta con `code 3074: no path between colorspaces` si el fuente no trae tags |

## 8. El defecto que rompe TODO (patrón a buscar primero)

```
unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0
→ Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]
```

**Es el fallo universal de las 10.573 cadenas de la lista.** Corregido `chroma_msize_x=3`, S1 y S2
ejecutan. S3 suma: `transfer=st2084`→`smpte2084`, `matrix=2020ncl`→`bt2020nc`, `scd=5`→[0..1].

**Protocolo:** ante una cadena que "no funciona", aislar **etapa por etapa** y leer el stderr
literal antes de tocar nada más.

## 9. Techo real de rendimiento (medido en host sin GPU)

| Cadena | fps |
|---|---|
| P4 720p/30 corregida | 452,6 |
| P3 1080p/60 corregida | 241,3 |
| **P1 4K/60 corregida** | **29,6** (no llega a 60) |
| `minterpolate` solo | 23,4× tiempo real |
| P3 completa con `minterpolate` | **46,9× tiempo real** |
| 4K con el `nlmeans` original | **0,084 fps** |

**Consecuencia:** "120 fps" es decorativo. En directo no se sostiene ni en 4K/60 con la cadena
completa. Declararlo como aplicado es mentir.

## 10. Layout real del bloque de canal

**El URI NO es la última línea.** Tras él:

```
http://<host>/live/<USER>/<PASS>/<id>.m3u8
#EXTVLCOPT:clock-jitter=0
#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
(vacía)
```

`lines_after_uri = 3` en 10.572 canales; **7 en el último**. Cualquier parser que cierre el bloque
en el URI **pierde 2 tags**.

Plantilla: `134 #EXTVLCOPT + 103 #KODIPROP + 54 #EXTATTRFROMURL + 615–618 #EXT-X-APE-* +
25 CMAF + 20 VNOVA + 18 PHANTOM-HYDRA + 1 EXTINF + 1 STREAM-INF + 1 I-FRAME + 1 DATERANGE +
1 #EXTHTTP + 1 URI`.

## 11. OTT Navigator — qué lee de verdad

Del changelog oficial (`ottnav.github.io/changelog.html`):

- **Embebe VLC 3.6.4** como motor de codec seleccionable (`codec: updated VLC to latest v3.6.4`).
- Parsea `#EXTVLCOPT` **solo para user-agent y http-referrer** (confirmado en changelog).
- Parsea `#KODIPROP` (`inputstream.adaptive.*`) y `#EXTATTRFROMURL`.
- **Nunca menciona video filters.** No hay evidencia de que aplique un filtergraph.

**Por eso la lista se ve bien en OTT Navigator: por el stream real + el motor + el VPP del SoC,
no por el `video-filter`.** Y solo aplicaría filtros si el usuario selecciona el codec **VLC**.

## 12. El verdadero lever de píxeles

`actor_injections.soc_vpp_dnr` → claves del SoC (`pq_ai_sr_enable`, `ai_sr_level`, `ai_pq_mode`,
`pq_sharpness_enable`, `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_hdr_enable`, `pq_hdr_mode`,
`match_content_frame_rate`, `hdr_conversion_mode`), aplicadas vía **ARA** y comandadas por VPS
(`push_pq_profile.php <perfil> [device] [channel]`).

**Truth-guard:** el VPS **no transcodifica**; el **device** post-procesa el frame decodificado,
aplica a cualquier códec (AVC/HEVC/AV1/DV) y a **todos** los players del device.

**Corrección permanente:** `hdr_conversion_mode` **NO** hace SDR→HDR; es conversión entre *tipos*
HDR (passthrough/system/force). SDR sigue SDR. El lever real es AI-SR/AI-PQ del SoC.

## 13. Estados de evidencia (usar uno por afirmación)

```
declarado  — está en un documento, tag o perfil
observado  — medido de una respuesta o bitstream real
resuelto   — una regla eligió un valor para una sesión
aplicado   — un motor reporta que lo ejecutó
verificado — reproducido de forma independiente con artefacto
```

Un tag en la playlist es **declarado**, nunca "aplicado".

## 14. Procedimiento

1. Identificar carril y runtime **antes** de escribir una cadena.
2. Extraer la cadena objetivo y **parsearla** con el binario real (`ffmpeg -filter_script` / VLC `--video-filter` + log).
3. Si falla: aislar etapa por etapa, leer el stderr literal.
4. Traducir solo lo que tiene equivalente real; lo que no, **`NO_VIABLE`** con el error.
5. Validar el layout del bloque (URI + cola) antes de emitir.
6. Registrar veredicto **con la ruta del log**.
7. Reportar separando declarado / observado / aplicado.

## 15. Reglas de oro

1. **Cero mentira al parser.** Un token que VLC no resuelve no se emite como `video-filter`.
2. **Un fallo de parser se atribuye al parámetro que el stderr nombra**, no al que parece.
3. **Ausencia de token ≠ ausencia de concepto**: respetar el case (`BT.1886` ≠ `bt1886`).
4. **Delimitar por el marcador real** (`#EXTINF`), nunca por un número fijo de líneas.
5. **Ningún número sin artefacto**; lo no medido es `NO COMPUTADO` con razón.
6. **No degradar** resolución/códec/HDR/fps/bitrate para "que funcione".
7. **No confundir declaración con ejecución.**
8. Si el recetario mejora la imagen solo en un carril, **decirlo**.

## 16. Anti-patrones (todos cometidos ya)

| Anti-patrón | Realidad |
|---|---|
| `#EXTVLCOPT:video-filter=ffmpeg{…}` | el módulo `ffmpeg` no existe |
| Emitir filtergraph ffmpeg en `#EXTVLCOPT` y llamarlo "aplicado" | VLC lo rechaza y **sigue reproduciendo** |
| «`me=umh` no existe» | **Sí existe** (1..9); fallaba `scd=5` |
| «`bt1886=0`» | `BT.1886` aparece 9.765 veces como metadata |
| Contar 256/189/108 por canal | son **134/103/54**; el tramo fijo engaña |
| Asumir que la lista tiene P5 | **0 instancias** |
| Asumir URI = última línea | hay **2 tags** después |
| Afirmar 120 fps | medido: P1 4K = **29,6 fps** |

## 17. Artefactos de la skill

| Ruta | Contenido |
|---|---|
| `tools/ape-image-recipes/recipes.json` | fuente única, 3 proyecciones por perfil |
| `tools/ape-image-recipes/compile.js` | compilador, falla cerrado |
| `tools/ape-image-recipes/decode_lab_metadata.js` | decodifica los 20 chunks del LAB |
| `tools/ape-image-recipes/audit_vlcopt.js` | audita opciones contra los binarios de VLC |
| `tools/ape-image-recipes/CORRECTIONS.md` | los errores propios, con quién los refutó |
| `tools/ape-image-recipes/VLC_OPT_AUDIT.md` | las 80 ausentes y las 58 presentes |
| `tools/ape-image-recipes/PROMPT_LOOP.md` | el loop L1–L7 × 3 lanes con gates |
| `docs/cartography/APE_LISTA_523d52a6/01..04` | cartografía del equipo (t1–t4) |

## 18. Límites honestos

- Fuentes de prueba **sintéticas** (testsrc2/y4m, mp4 480p), no TS HLS real.
- Los fps son de **este host sin GPU**; no extrapolan al VPS ni al device.
- Presencia de una opción en un binario **no** prueba que esté registrada (upper bound).
- La corroboración conductual de opciones es **n=4**.
- ExoPlayer/OTT/TiviMate/Kodi: veredicto **normativo** (RFC 8216 §6.3.1) y de arquitectura, no empírico.
- La aplicación conjunta de varios módulos VLC **no** está verificada end-to-end: el arnés headless
  aborta con `Too high level of recursion` tras el primer módulo. Requiere vout real en device.
