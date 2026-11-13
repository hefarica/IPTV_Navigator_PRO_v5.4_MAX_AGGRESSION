# La familia de códec declarada es una PREFERENCIA, medida falsa 7 de 7 · 2026-11-13

**Qué se midió:** extendí la herramienta para contrastar la **segunda** declaración del catálogo — `ape-codec-family` — contra el códec real del segmento. Recibo: `docs/audits/DECLARED_VS_REAL_20261113T033725Z.json`.

## El resultado

```
#   perfil  medido  resolucion  veredicto   canal
2   P3      MEDIDO  1920x1080   CUMPLE      AR| BEIN SPORTS NEWS FHD
                                          -> CODEC: declara 'hevc' y sirve h264
3   P3      MEDIDO  1280x720    NO CUMPLE   AR| BEIN SPORTS NBA FHD
                                          -> CODEC: declara 'hevc' y sirve h264
4   P3      MEDIDO  1920x1080   CUMPLE      AR| BEIN SPORTS 03 FHD
                                          -> CODEC: declara 'hevc' y sirve h264
...
medidos: 7 · NO CUMPLEN resolucion: 1 · NO CUMPLEN codec: 7
```

**Siete de siete declaran `hevc` y sirven `h264`.** El 100 % de la muestra.

## Antes de acusar, dos comprobaciones

**1 · ¿Hay una variante HEVC que yo no vi?** No. El manifiesto de ese canal es de **media**, no un master:

```
#EXT-X-STREAM-INF : 0     ← cero variantes
#EXTINF           : 6
#EXT-X-MEDIA      : 1
```

**Solo existe un flujo, y es h264.** La declaración no puede referirse a una variante alternativa.

**2 · ¿De dónde sale la declaración?** Del código, `m3u8-typed-arrays-ultimate.js:8245`:

```js
const codecFamRaw = (channel.codecFamily
                  || (typeof PROFILES !== 'undefined' && PROFILES[profile]?.codec)
                  || 'HEVC').toString().toUpperCase();
```

Y el comentario que lo acompaña, en las líneas 8240-8244:

```js
// [HEVC-CASCADE-CSV FIX 2026-05-20 · HFRC mandato] Default 'H264' producía
// 100% canales (13,137/13,137) con ape-codec-family="h264" porque el feed
// Xtream no trae channel.codecFamily. MAX IMAGE FIRST exige HEVC default
// (cascada CSV emite hvc1.2.4.* per-resolución, ver ape-hevc-cascade.js).
```

**La cadena completa:** el feed Xtream **no trae** `codecFamily` → se toma del **perfil** → el perfil sale del **nombre** (`profileForChannel(name, group)`) → y si no hay perfil, el valor por defecto es literalmente **`'HEVC'`**.

## Esto NO es un bug: es una decisión de doctrina

Y hay que decirlo así. El sistema **decidió** declarar HEVC por defecto porque **MAX IMAGE FIRST** manda preferir HEVC, y el comentario documenta que antes declaraba `h264` en el 100 % de los canales y eso se consideró peor.

**Es una preferencia deliberada.** Pero una preferencia **no es una medición**, y hasta hoy nadie había comprobado qué sirve realmente el otro lado.

Medido: **el otro lado sirve h264. Siempre. En los 7 que probé.**

## Por qué importa, y dónde está el límite

- **Para un reproductor que no lee la metadata** (OTT Navigator, como se midió ayer), no pasa nada: decodifica AVC y reproduce. **Eso es lo que se observó.**
- **Para cualquier consumidor que la lea como hecho** —un player que elija decodificador por familia declarada, un analizador, o el propio `#KODIPROP`/`STREAM-INF` si alguien la propaga— la declaración es **falsa**. La GOLDEN RULE del repo existe precisamente porque declarar un códec que el bitstream no es puede producir el fallo de reproducción.
- **La declaración no distingue** el canal donde HEVC es cierto del que no. Igual que pasa con el perfil: acierta por coincidencia cuando el feed es veraz, falla cuando no.

## Lo que esto NO dice

- **No dice que el sistema rompa la reproducción.** Lo medido es que reproduce (AYER: AVC 1080p decodificado en OTT Navigator).
- **No dice que el generador esté mal escrito.** El comentario muestra que el comportamiento es intencional y con motivo.
- **No dice nada de los canales que sí son HEVC**: 7 de 7 en este bloque no son HEVC, pero el bloque es «BEIN SPORTS FHD» de un proveedor concreto. No es un censo.

## La pregunta que deja abierta, y es del operador

La doctrina **MAX IMAGE FIRST** («preferir HEVC») y la exigencia de §11 («no declarar una salida falsa») apuntan en direcciones opuestas para un campo **medible**. Las salidas honestas son:

1. **Declarar lo medido** (`ape-codec-family="h264"`) y dejar la *preferencia* en un campo aparte —p. ej. `ape-codec-preferred="hevc"`— para no mezclar hecho con deseo.
2. **Medir al construir la lista** y declarar la familia real por canal, como se hace con estas herramientas.
3. **Mantener la preferencia** y documentar explícitamente que `ape-codec-family` **no es un hecho medido** sino una preferencia del generador, para que ningún consumidor la trate como verdad.

Ninguna se ha aplicado. **Tocar el generador es tuyo y necesita su propio A/B.**
