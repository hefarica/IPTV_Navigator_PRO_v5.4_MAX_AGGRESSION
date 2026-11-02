# Libro mayor de la lista — cada afirmación con su artefacto

**Entrada:** `APE_LISTA_1793589060441.m3u8` · 604.593.696 B · sha256 `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`
**Servida en:** `https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8`
**Fecha:** 2026-11-02 · **VPS: cero escrituras en toda la sesión.**

Este documento existe porque una cifra sin artefacto es una opinión. Cada fila nombra **cómo se
comprobó** y **en qué estado está**. `NO COMPUTADO` no es cero. `NO EVALUADO` no es aprobado.

---

## 0 · Estado del requisito que bloquea el cierre

**Requisito del operador:** todas las listas, en todas sus configuraciones, deben entregar **200, 206 y 302**.

| Pata | Hoy | Con parches | Artefacto | Estado |
|---|---:|---:|---|---|
| 200 | **8/8** | 8/8 | `tools/ape-http-conformance/gate_matrix.js` | MEDIDO |
| 206 | **4/8** | **8/8** | `PATCHED-206-dual.conf` · run `41485054319` | PARCHE MEDIDO, NO APLICADO |
| 302 | **0/4** | **4/4** | `PATCHED-302.conf` · run `41489992875` | PARCHE MEDIDO, NO APLICADO |
| **total** | **12/20** | **20/20** | — | **3 cambios, ninguno autorizado** |

---

## 1 · Estructura del fichero

| ID | Afirmación | Valor medido | Cómo | Estado |
|---|---|---:|---|---|
| E-1 | bloques de canal | 10.573 | `parse_defects.js` | MEDIDO |
| E-2 | `#EXTINF` | 10.573 | censo | MEDIDO |
| E-3 | `#EXT-X-STREAM-INF` | 10.573 | censo | MEDIDO |
| E-4 | `#EXT-X-I-FRAME-STREAM-INF` | 10.573 | censo | MEDIDO |
| E-5 | `#EXT-X-DATERANGE` | 10.574 | censo | MEDIDO |
| E-6 | **`#EXT-X-MEDIA`** | **0** | censo completo | MEDIDO |
| E-7 | `#EXT-X-MAP` | **0** | censo | MEDIDO |
| E-8 | tags distintos en bloque | 689 | `tag_variance.js` | MEDIDO |
| E-9 | tags de cabecera | 134 | idem | MEDIDO |
| E-10 | forma real | **lista de canales con tags de máster por canal**, no un manifiesto HLS | `15_STRUCTURE_AND_CMAF.md` | MEDIDO |

**Consecuencia de E-6:** sin `#EXT-X-MEDIA` no existe pista de audio separada. Todo lo que declare
throughpass es inaplicable en esa lista.

---

## 2 · Censo de varianza de tags

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| V-1 | tags `CONSTANTE` | 473 | `14_TAG_VARIANCE_CENSUS.md` | MEDIDO |
| V-2 | tags `VARIA` | 208 | idem | MEDIDO |
| V-3 | tags `PARCIAL` | 6 | idem | MEDIDO |
| V-4 | tags `RARO` | 2 | idem | MEDIDO |
| V-5 | de los 611 `EXT-X-APE-*`: constantes | **436** | idem | MEDIDO |
| V-6 | de los 611 `EXT-X-APE-*`: varían | **175** | idem | MEDIDO |

**436 tags constantes** en una lista que se presenta como calibrada por canal: un valor idéntico en
10.573 canales no es calibración, es una constante.

---

## 3 · Plano de audio

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| A-1 | contradicciones totales | **74.011** | `audio_contradictions.js` | MEDIDO |
| A-2 | C1 booleano opuesto | 42.292 | idem | MEDIDO |
| A-3 | C2 anchos inconsistentes | 10.573 | idem | MEDIDO |
| A-4 | C3 codec vacío | 10.573 | idem | MEDIDO |
| A-5 | C4 passthrough imposible | 10.573 | idem | MEDIDO |
| A-6 | claves `inputstream.adaptive.*` distintas | **99** | `kodiprop_key_audit.js` | MEDIDO |
| A-7 | … de ellas **inventadas** | **90 (90,9 %)** | idem, contra wiki oficial | MEDIDO |
| A-8 | … de ellas reales y vigentes | 4 | idem | MEDIDO |
| A-9 | … reales pero deprecadas | 4 | idem | MEDIDO |
| A-10 | … sin verificar (`chooser_*`) | 1 | idem | **NO VERIFICADO** |
| A-11 | **claves de audio inventadas** | **15 de 15** | idem | MEDIDO |
| A-12 | `#EXTVLCOPT:audio-channels` es opción real de VLC | sí | `VLC_OPT_AUDIT.md` (58 presentes) | MEDIDO |

**Corrección que debo a mi propio informe de la ronda 29:** escribí que `#KODIPROP` «sí se lee en Kodi».
El mecanismo se lee; **ninguna de sus 15 claves de audio es una propiedad válida** (A-11). La capa
KODIPROP del audio está tan muerta como la APE.

**Reconciliación construida y probada:** `reconcile_audio.js` (R1 passthrough→false, R2 borra las 15
inventadas, R3 borra `audio-channels`). Prueba: contradicciones **7→0**, inventadas **4→0**, y la
segunda pasada aplica **0 reglas** con sha256 idéntico (idempotente). CI `41485991968`. **No aplicada.**

---

## 4 · Plano de vídeo

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| F-1 | líneas `#EXTVLCOPT:video-filter=` | 10.573 | `video_filter_audit.js` | MEDIDO |
| F-2 | **cadenas distintas** | **3** | idem | MEDIDO |
| F-3 | módulos de filtro distintos | 8 | idem | MEDIDO |
| F-4 | **cadena que contiene un escalador** | **0 de 3** | idem | MEDIDO |
| F-5 | canales sin escalador | **10.573** | idem | MEDIDO |
| F-6 | canales con `minterpolate` | 10.573 | idem | MEDIDO |
| F-7 | canales con `minterpolate scd=0` | **9.765** | idem | MEDIDO |
| F-8 | canales 30→120 fps (factor 4×) con `me=epzs` | **7.457** | idem | MEDIDO |
| F-9 | canales con gamut del filtro ≠ gamut declarado | **2.308** (bt709 vs BT2020) | idem | MEDIDO |

**F-4 es el hallazgo central del plano de vídeo:** la lista declara `4KFALSE-TARGET-RES: 3840x2160` en
los 10.573 y **ninguna de sus tres cadenas contiene un solo `w=`/`h=`/`scale=`**. El objetivo 4K no
tiene mecanismo en este carril.

**Defecto que tuve en mi propia herramienta:** su primera versión evaluaba cada filtro al leer la línea,
pero en este fichero el `video-filter` aparece **antes** de `FPS-SUPREMACY` y `HDR-PRIMARIES` del mismo
bloque, así que los dos cruces salían `?` y **F-8 se apagaba en silencio**. Corregido con buffer por
bloque; después del arreglo apareció F-8.

---

## 5 · Las cadenas V2 propuestas por el operador

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| X-1 | cadenas V2 ejecutadas | 4 de 6 | run `41487670064` | MEDIDO |
| X-2 | **que ejecutan en ffmpeg** | **0 de 4** | idem | MEDIDO |
| X-3 | dialectos ajenos identificados | **5** | `19_V2_CHAINS_MEASURED.md` | MEDIDO |
| X-4 | cadenas corregidas que **parsean** | 4 de 4 | run `41489250513` | MEDIDO |
| X-5 | cadenas corregidas que **producen la resolución declarada** | **0 — no probado** | idem, exit 222 sin diagnóstico | **NO COMPUTADO** |
| X-6 | P0 y P1 | no ejecutadas | memoria del runner | **NO EVALUADO** |

**Los cinco dialectos** (cada uno con su error literal): `pp=ac/dr/ci` = VLC/libpostproc ·
`accurate_rnd+full_chroma_int` = flags de `scale` dentro de `zscale` · `transfer=bt1886` = no existe en
zimg · `transfer=st2084` = zimg escribe `smpte2084` · `dither=blue-noise` = libplacebo.

**Ningún motor ejecuta la cadena completa:** ffmpeg rechaza la pieza de VLC, VLC no tiene `zscale` ni
`minterpolate`.

---

## 6 · Plano HDR

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| H-1 | canales con `MaxFALL(1000) > MaxCLL` | **9.765** | `13_HDR_PLANE_AUDIT.md` | MEDIDO |
| H-2 | `HDR-TRANSFER: BT1886` | 100 % (incl. 808 PQ) | idem | MEDIDO |
| H-3 | `VIDEO-RANGE=PQ` incondicional | 100 % | decisión LOCKED del propietario 2026-06-16 | MEDIDO |
| H-4 | `HDR-METADATA` | **VARIA (3)**, no constante | idem, corregido en ronda 33 | MEDIDO |

**H-1 es físicamente imposible:** el promedio de un frame no puede superar su pico.

---

## 7 · Calibración LAB

| ID | Afirmación | Valor | Artefacto | Estado |
|---|---|---:|---|---|
| L-1 | knobs | 42 | `lab_calibration_check.js` | MEDIDO |
| L-2 | knobs fuera de su propio bound | **4** | idem | MEDIDO |
| L-3 | `FITNESS` de P4 | **0,2502** | `16_LAB_CALIBRATION_AUDIT.md` | MEDIDO |
| L-4 | `FITNESS` de P5 | 0,2175 | idem | MEDIDO |
| L-5 | canales asignados a P4 (peor fitness) | **7.457 (70,53 %)** | idem | MEDIDO |
| L-6 | perfiles asignados a **cero** canales | **3 de 6** (P0, P2, P5) | idem | MEDIDO |
| L-7 | qué mide `FITNESS` | **no definido en la cabecera** | idem | **NO COMPUTADO** |

**L-5 y L-3 juntos:** la mayoría de los canales usa el perfil con peor puntuación, y nadie sabe qué
mide esa puntuación.

---

## 8 · Estado de los gates y de la CI

| Gate / workflow | Resultado | Artefacto |
|---|---|---|
| `gate_matrix.js` | 12/20 | `GATE_MATRIX_MEASURED.md` |
| `ape-parse-gates.yml` | 14 pasos verdes | run `41485991968` |
| `ape-demuxed-gates.yml` | verde | run `41477652972` |
| `tools-exit-contract.yml` | verde | run `41478819582` |
| `ape-206-local-proof.yml` | **8/8 celdas** | run `41485054319` |
| `ape-302-proof.yml` | **301→302, 200/206 intactas** | run `41489992875` |
| `ape-v2-chains-proof.yml` | 4/4 originales fallan; corregidas parsean | run `41489250513` |

---

## 9 · Lo que NO está computado, y por qué

| Cosa | Estado | Razón |
|---|---|---|
| Throughpass de audio real | **NO COMPUTADO** | `#EXT-X-MEDIA` = 0 (E-6). No hay pista que reenviar. Requiere packager. |
| Resolución real de origen por canal | **NO COMPUTADO** | Exigiría descargar 10.573 flujos; la sesión no ha tocado los upstreams. |
| Qué mide `FITNESS` | **NO COMPUTADO** | No está en la cabecera (L-7). |
| Salida de las cadenas V2 corregidas | **NO COMPUTADO** | exit 222 en el banco, sin diagnóstico aislado (X-5). |
| P0 y P1 de las V2 | **NO EVALUADO** | memoria del runner (X-6). |
| Si VLC tiene `unsharp`/`yadif`/`nlmeans`/`bwdif`/`zscale`/`minterpolate` como módulos | **NO VERIFICADO** | wiki sin ficha para `unsharp` (404); GitLab tras anti-scraping. |
| Verdad de las 22 reglas visuales | **NO EVALUADO** | fuera de alcance de esta sesión. |

---

## 10 · Los tres artefactos pendientes de autorización

| Artefacto | Efecto medido | Prueba | Toca producción |
|---|---|---|---|
| `PATCHED-206-dual.conf` | 206 de 4/8 → 8/8 | run `41485054319` | no aplicado |
| `PATCHED-302.conf` | 302 de 0/4 → 4/4 | run `41489992875` | no aplicado |
| `reconcile_audio.js` | cierra las 2 auditorías de audio | CI `41485991968` | no aplicado |

Los tres son reversibles, con prueba en CI y con **cero escrituras al VPS**.
