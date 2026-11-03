# CORRECCIONES — afirmaciones mías refutadas por el equipo

Registro de errores propios, con el artefacto que los refuta. Se conserva para que no
vuelvan a circular aguas abajo (skill, generador, ledger).

---

## C-1 · «`me=umh` / `me=tss` no existen en `minterpolate`» — **FALSO**

**Lo que dije:** la opción sería `me_mode` y `umh`/`tss` serían inválidos.
**Refutado por:** t2 (`docs/cartography/APE_LISTA_523d52a6/02_VIDEO_FILTER_MATRIX.md`) y
re-verificado aquí.

`minterpolate` tiene **`me` <int> (from 1 to 9) (default epzs)** además de `me_mode`.
Medición propia (2026-11-02):

| cadena | veredicto |
|---|---|
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=umh:mb_size=8` | **PASS** |
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=tss:mb_size=8` | **PASS** |
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5` | **FAIL** |

**Causa del error propio:** mi test de `me=umh` incluía también `scd=5`; el parser falló por
`scd` (rango [0..1]) y yo atribuí el fallo a `me`. Error de atribución, no de medición.

**Lo que sí es inválido en la cadena de la lista:** `scd=5` (debe ser 0 o 1) y
`unsharp ... chroma_msize_x=0` (rango [3..23]).

---

## C-2 · «`bt1886 = 0` en la lista» — **IMPRECISO POR CASE-SENSITIVITY**

**Lo que dije:** `bt1886=0`, como evidencia de que la prosa del operador no estaba en la lista.
**Refutado por:** t1 (`01_STRUCTURE.md`).

`BT.1886` aparece **9.765** veces (12.043 case-insensitive) como valor de
`X-COLOR-TRANSFER` en `#EXT-X-DATERANGE`, y también en `#EXT-X-APE-HDR-TRANSFER`.

**Formulación correcta:** `zscale=transfer=bt1886` (argumento de filtro, minúsculas) = **0**;
`BT.1886` como metadata declarativa = **9.765**. Son cosas distintas y la segunda no es un 0.

---

## C-3 · «256 `#EXTVLCOPT` / 189 `#KODIPROP` / 108 `#EXTATTRFROMURL` por canal» — **FALSO**

**Causa propia:** extraje con `rg -A 1500`, un tramo fijo de 1500 líneas, y lo presenté como
«bloque de canal». No lo era.
**Refutado por:** t3 y t1, que delimitan el bloque de verdad (`#EXTINF i` … antes de `#EXTINF i+1`).

Reales: **134 / 103 / 54** por canal. Las tres divisiones dan entero exacto sobre 10.573.

---

## C-4 · «Cero de las cadenas de la lista parsea» — **CIERTO PERO MAL CARACTERIZADO**

**Lo que dije:** las cadenas fallan por `pp`, `bt1886`, `blue-noise`, `accurate_rnd`, `scd`.
**Realidad medida por t2:** el fallo **universal** de las 10.573 cadenas es **uno solo**:
`unsharp ... chroma_msize_x=0`, fuera de rango `[3..23]`. Corregido ese único parámetro,
S1 y S2 ejecutan. S3 (P1) suma 3 defectos propios: `transfer=st2084`→`smpte2084`,
`matrix=2020ncl`→`bt2020nc`, `scd=5`→rango [0..1].

**Consecuencia:** mi lista de defectos era correcta para la *prosa* del operador, pero no era
la causa del fallo del *archivo real*. La causa real es un parámetro.

---

## C-5 · «La lista tiene P5» — **FALSO**

t2: **0 instancias de P5** en la lista. Solo P4 (7.457), P3 (2.308), P1 (808).
`recipes.json` mantiene P5 marcado como **propuesta validada**, no como perfil en uso.

---

## C-6 · «El URI es la última línea del bloque» — **FALSO**

t1: tras el URI vienen `#EXTVLCOPT:clock-jitter=0` y `#EXT-X-APE-CRYSTAL-UHD:…` y luego una
línea vacía (`lines_after_uri=3` en 10.572 canales; 7 en el último).
**Corregido en** `tools/ape-image-recipes/compile.js` → `emitM3uBlock()` ya emite ese layout.

Layout medido (ejemplo real, credenciales redactadas):

```
http://<host>/live/<USER>/<PASS>/3.m3u8
#EXTVLCOPT:clock-jitter=0
#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
(vacía)
```

`VPP_INTENSITY=55` se observó **solo** en P3. El compilador **no lo inventa**: se emite
únicamente si se pasa `--vpp-intensity`; si no, el tag va sin ese campo.

---

## C-7 · «`video-filter` falla por sintaxis» — **INCOMPLETO, y el matiz manda**

**Lo que dije:** el carril VLC falla porque los nombres no son módulos de VLC.
**Refutado por:** t4, con medición más profunda.

VLC 3.0.24 **cierra `video-filter` por política** cuando la opción viene de un ítem de playlist:

```
main error: unsafe option "video-filter" has been ignored for security reasons
```

0 filtros instanciados y el canal **reproduce igual**. `avcodec-hw` está en la misma lista negra.
Artefacto: `scratch/lane_matrix_04/vlc_bc/DBG.log`.

**Formulación correcta:** con nombres ffmpeg falla por *resolución de módulo*; con sintaxis de
módulo correcta falla por *política de seguridad*. **En playlist no se ejecuta nunca.** El único
camino que ejecuta es la **CLI** (`vlc --video-filter=…`).

**Consecuencia de diseño:** no hay que "arreglar la sintaxis"; hay que dejar de prometer filtros
en la playlist y mover el efecto real a ARA/VPP.

---

## C-8 · «El separador de módulos es `,`» — **FALSO: es `:`**

**Lo que implicaba:** al cargar solo el primer módulo de una cadena con `,`, deduje que el arnés
abortaba.
**Refutado por:** t4. `,` **no** separa módulos (carga solo el primero); **`:` sí**.

Cadena válida por CLI:
`hqdn3d{luma-spat=2.0,chroma-spat=1.5,luma-temp=3.0,chroma-temp=2.5}:gradfun{radius=12,strength=0.8}:sharpen{sigma=0.5}`

---

## C-9 · «`hqdn3d` no acepta ninguna opción» — **FALSO**

**Lo que dije:** el módulo carga pero rechaza sus opciones.
**Refutado por:** t4.

Acepta las formas **abreviadas**: `luma-spat`, `chroma-spat`, `luma-temp`, `chroma-temp`.
Rechaza `luma_spatial`, `luma-spatial` y `luma_tmp`. Mi prueba usó solo las formas largas y
concluí de más.

---

## C-10 · «El arnés aborta con `Too high level of recursion`» — **MAL ATRIBUIDO**

**Lo que dije:** la cadena multi-módulo no se verificaba porque el vout dummy abortaba.
**Refutado por:** t4: 98 avisos, pero decoder + EOF en **30/30** corridas. **No aborta.**

La razón real de que solo cargara un módulo era el **separador** (C-8).

---

## C-11 · «`adaptive-maxbitrate=8000000` en 9.765 canales» — **CONFUNDÍ PRESENCIA CON VALOR**

**Lo que dije:** la opción `adaptive-maxbitrate` existe en 9.765 canales.
**Refutado por:** t7 (corrida real sobre los 604 MB).

La **opción** está en **10.573** canales. El **valor 8.000.000** en 9.765; los otros **808** llevan
**19.800.000**. Presencia de la opción ≠ presencia de ese valor.

---

## C-12 · «`video-width/height` pide salida a 720p» — **FALTABA UN TERCER VALOR**

**Lo que dije:** `1280x720` en 7.457 y `1920x1080` en 2.308 ⇒ la lista pide salida reducida.
**Refutado por:** t7.

La opción está en **10.573** canales, con **tres** valores: `1280x720` (7.457), `1920x1080`
(2.308) y **`3840x2160` (808)**, que **no** pide salida reducida. Mi afirmación era verdadera solo
para 9.765 de 10.573.

---

## C-13 · «`inputstream.adaptive.max_bitrate` es un cap a quitar» — **ESA CLAVE NO EXISTE**

**Lo que dije:** lo incluí en la lista de caps de la tarea t7.
**Refutado por:** t7: **0 ocurrencias** en la lista.

Extrapolé del patrón `inputstream.adaptive.*` sin medirlo. La regla del generador existe y es
no-op. Error de invención por simetría, exactamente el que la doctrina prohíbe.

---

## C-14 · «Quitar los caps levanta el techo de vídeo» — **FALSO EN VLC**

**Lo que implicaba:** eliminar `adaptive-maxbitrate` / `video-width` / `video-height` mejora la imagen.
**Refutado por:** t7 + t4 + el propio `VLC_OPT_AUDIT.md`.

De 138 nombres `#EXTVLCOPT`, **80 no existen en VLC** — toda la familia `adaptive-*` y
`video-width/height`. VLC las descarta **en silencio**. Quitarlas no levanta ningún techo real:
limpia un **techo declarado**.

**El cap que sí muerde** es `inputstream.adaptive.*` (clave real del addon de Kodi). El reporte
de t7 marca cada línea con `effect_measured`: `inert-vlc` (52.865) vs `kodi-addon-key` (21.146).

**Corolario honesto:** el valor de este generador no es "mejora la imagen en VLC" — es
**des-mentir el manifiesto** y quitar el cap donde un addon real lo lee.

---

## C-15 · Hallazgo nuevo (de t7, no mío): el cap de fps contradice a su propia variante

`max_framerate=30` aparece en 7.457 canales, pero **1.185 de ellos declaran
`FRAME-RATE=60.000`** en su `#EXT-X-STREAM-INF`. Ahí el cap **sí muerde** y contradice la
declaración del propio manifiesto. Es el cap con efecto real más claro de todos.
