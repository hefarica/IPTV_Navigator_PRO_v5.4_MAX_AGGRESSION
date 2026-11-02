# El plano de audio de la lista se contradice a sí mismo

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Método:** lectura directa de la cabecera y del primer bloque de canal, con números de línea.

El bloque de audio se repite **por canal**. En el canal 1 ocupa las líneas 240–652; el mismo bloque
reaparece en 1217–1632, 2193–2608, 3170–… Un bloque idéntico cada ~977 líneas, 10.573 veces.

Dentro de **un solo bloque** hay tres contradicciones independientes.

---

## F-01 · Atmos: `ENABLED=true` y `false` en el mismo canal

```
 341: #KODIPROP:inputstream.adaptive.audio_dolby_atmos=false
 642: #EXT-X-APE-AUDIO-ATMOS:ENABLED=true,CHANNELS=7.1.4,OBJECTS=128
```

**Severidad: ALTA** · Capa: metadata de audio por canal
**Síntoma:** la misma propiedad (¿hay Atmos?) declarada con valores opuestos por dos capas distintas del
mismo bloque.
**Causa raíz:** dos generadores escriben la misma propiedad sin reconciliarse: la familia `APE-*` describe
un objetivo aspiracional y el bloque `KODIPROP` (que es el que lee Kodi/ISA) describe otra cosa.
**Impacto:** un reproductor que lea `KODIPROP` verá Atmos desactivado; cualquier herramienta que lea la
capa `APE-*` verá Atmos activado. Dos consumidores del mismo fichero sacan conclusiones opuestas.
**Prueba:** líneas 341 y 642 del fichero, reproducibles con `grep -n`.

## F-02 · Lo mismo con DTS-X, TrueHD y EAC3

```
 342: #KODIPROP:...audio_dts=false          vs  643: #EXT-X-APE-AUDIO-DTS-X:ENABLED=true,CHANNELS=7.1.4
 343: #KODIPROP:...audio_truehd=false       vs  644: #EXT-X-APE-AUDIO-TRUEHD:ENABLED=true,CHANNELS=7.1
 344: #KODIPROP:...audio_eac3=false         vs  645: #EXT-X-APE-AUDIO-EAC3:ENABLED=true,CHANNELS=5.1
```

**Severidad: ALTA** · misma causa que F-01, cuatro códecs en lugar de uno.

**Y el conjunto es imposible de sostener:** el bloque declara **siete** códecs activos a la vez —
Atmos (7.1.4, 128 objetos), DTS-X (7.1.4), TrueHD (7.1), EAC3 (5.1), AC3 (5.1), AAC (2.0), MP3 (2.0).
Un solo flujo muxed no transporta los siete.

## F-03 · Tres anchos de canal distintos para la misma pista

```
 240: #EXTVLCOPT:audio-channels=6
 340: #KODIPROP:inputstream.adaptive.audio_channels=7.1
 641: #EXT-X-APE-AUDIO:CODEC=,CHANNELS=7.1.4
```

**Severidad: MEDIA** · Capa: metadata de audio por canal
**Síntoma:** el mismo canal declarado como **6**, **7.1** y **7.1.4** en tres capas del mismo bloque.
`audio-channels=6` es una **instrucción de salida**, no una descripción: le dice al reproductor en cuántos
canales sacar el audio. Si la fuente es estéreo, eso es un **upmix forzado**, no passthrough.
**Prueba:** líneas 240, 340, 641.

## F-04 · El códec de audio está vacío en los tres sitios donde debería estar

```
 641: #EXT-X-APE-AUDIO:CODEC=,CHANNELS=7.1.4
      #EXT-X-APE-TELCHEMY-CODEC:PRIMARY=HVC1.2.4.L123.B0,FALLBACK=AVC,AUDIO=
      #EXTHTTP:{… "X-APE-Codec-Audio":"" …}
```

**Severidad: MEDIA** · Capa: metadata
**Síntoma:** `CODEC=`, `AUDIO=` y `"X-APE-Codec-Audio":""` — los tres vacíos, mientras al lado se declaran
7.1.4 canales y `BITRATE:400kbps`.
**Impacto:** cualquier consumidor que construya una cadena `CODECS="video,audio"` a partir de esto emitirá
una cadena inválida o un campo vacío. Es el campo que el pipeline dice necesitar y no rellena.

## F-05 · `PASSTHROUGH:ENABLED=true` en 10.573 canales donde el passthrough es imposible

```
 649: #EXT-X-APE-AUDIO-PASSTHROUGH:ENABLED=true      ← una por canal, 10.573 veces
 169: #EXT-X-APE-AUDIO-PASSTHROUGH:SAFE              ← una sola, en la cabecera
```

**Severidad: ALTA** · Capa: metadata de audio
**Síntoma:** la lista declara passthrough de audio **activado** en los 10.573 canales.
**Por qué es falso, con el censo completo como evidencia:**
- `#EXT-X-MEDIA` aparece **0 veces** en los 604 MB (censo de 819 tags, informe `09_TAG_CENSUS_819.md`).
- Sin `#EXT-X-MEDIA` no hay rendition de audio con URI propio: **no hay nada que reenviar**.
- `#EXT-X-MAP` = 0 → no hay CMAF, luego tampoco pista de audio separada de ese lado.
- Un solo URI por canal, muxed.

**El passthrough no es una opción que se pueda activar con una etiqueta: exige una pista de audio
separada que exista.** Aquí no existe, y la etiqueta dice que sí.

---

## Por qué esto importa más que un contador

Estas cinco cosas son **metadata inerte para el reproductor HLS genérico** (RFC 8216 §6.3.1: los tags
desconocidos se ignoran). Pero:

1. **`#KODIPROP` sí se lee** en Kodi y en los players basados en InputStream Adaptive. Un `false`
   explícito ahí desactiva un códec que la capa `APE-*` dice tener activo.
2. **`#EXTVLCOPT:audio-channels=6` es una instrucción de salida** para VLC, no una descripción. Forzar 6
   canales sobre una fuente estéreo produce upmix.
3. **`PASSTHROUGH:ENABLED=true` es una promesa de calidad que el pipeline no puede cumplir.** Es de la
   misma familia que el `sha256=unverified` del informe del censo: una declaración que parece una garantía.

## Lo que este informe NO dice

- **No dice qué contiene el flujo de origen.** Nunca he sondeado el upstream: no sé si realmente hay
  Atmos, DTS-X o estéreo. Digo que la lista declara cosas incompatibles entre sí, no que una concreta sea
  la verdadera.
- **No he re-auditado estos nombres de opción contra el binario de VLC.** `audio-channels`, `audio-desync`,
  `audio-time-stretch` figuran aquí como texto del fichero; si VLC las respeta es lo que responde
  `tools/ape-image-recipes/VLC_OPT_AUDIT.md`, y no lo he vuelto a correr para estos nombres en esta ronda.
- **No propongo un parche de la lista.** Corregir esto es decidir cuál de las dos capas manda, y eso es
  una decisión de diseño del generador, no un `sed`.

## La corrección mínima, si el operador la quiere

Para cada canal, **una sola fuente de verdad para el audio**, y que la otra capa se derive de ella:

1. Elegir si `KODIPROP` o `APE-*` manda (mi lectura: `KODIPROP`, porque es el que un player real lee).
2. Que `PASSTHROUGH` sea `false` cuando `#EXT-X-MEDIA` sea 0 — calculado, no literal.
3. Que `CODEC` no se emita vacío: o el códec real, o no se emite el tag.
4. Un único ancho de canal, y ninguno en `EXTVLCOPT` si no hay evidencia de la fuente.

Nada de eso está aplicado, y nada de eso toca el VPS.
