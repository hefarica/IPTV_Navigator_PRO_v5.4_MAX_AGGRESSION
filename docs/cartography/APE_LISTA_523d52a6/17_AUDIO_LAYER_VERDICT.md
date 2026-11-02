# Veredicto sobre el plano de audio: la Opción A es imposible, y la capa KODIPROP no es la autoridad

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Herramienta:** `node tools/ape-parse-defects/kodiprop_key_audit.js <lista>`
**Fuente normativa:** [xbmc/inputstream.adaptive · wiki Integration](https://github.com/xbmc/inputstream.adaptive/wiki/Integration) (consultada 2026-11-02).

## 1 · La pregunta era «qué capa manda». La pregunta previa era «qué capa se lee».

La Opción A propone que mande `#KODIPROP:inputstream.adaptive.*` porque `inputstream.adaptive` es el
motor real en Kodi. **El motor es real. Las claves de audio no.**

ISA **ignora en silencio** las propiedades que no conoce: una clave inventada no falla, no avisa, no hace
nada. Se comporta como si no estuviera, y por eso parece que funciona.

## 2 · El censo de las 99 claves

```
99 claves inputstream.adaptive.* distintas en la lista

REAL_VIGENTE     4
REAL_DEPRECADA   4
NO_VERIFICADA    1
INVENTADA       90   (90,9 %)
```

**Y las del plano de audio, las 15 son inventadas:**

```
audio_language_preference   audio_channels        audio_dolby_atmos
audio_dts                   audio_truehd          audio_eac3
audio_ac3                   audio_aac             audio_mp3
audio_passthrough           audio_samplerate      audio_bitdepth
audio_passthrough_earc      audio_codec_priority  audio_fallback
```

**Ninguna de las 15 existe como propiedad de `inputstream.adaptive`.** ISA las descarta todas. Elevar
esa capa a «autoridad» produce **exactamente cero efecto** sobre el audio: no es que mande poco, es que
no se lee.

Las 4 vigentes son `manifest_headers`, `stream_headers`, `manifest_config` y `stream_selection_type` —
ninguna de ellas configura audio. ISA es un **demuxer y selector de pistas**: tiene `stream_selection_type`
y `config.media_audio_*` para elegir *qué pista*, y **ninguna superficie de salida de audio**. Pedirle
`audio_bitdepth=24` es un error de categoría, no un parámetro discutible.

## 3 · Corrección a mi propio informe de la ronda 29

En `11_AUDIO_PLANE_CONTRADICTIONS.md` escribí que la capa `APE-*` describe «un objetivo aspiracional» y el
bloque `KODIPROP` «otra cosa», y añadí: *«`#KODIPROP` sí se lee en Kodi y en los players basados en
InputStream Adaptive»*.

**Eso era falso para el audio.** `KODIPROP` sí se lee como *mecanismo*, pero **ninguna de las 15 claves
de audio que emite es una propiedad válida**. La capa KODIPROP del audio está tan muerta como la APE.

## 4 · Qué gobierna el audio de verdad, por motor

| Motor | Qué lee | ¿Está en la lista? |
|---|---|---|
| **Kodi / ISA** | `#EXT-X-MEDIA` del manifiesto + `stream_selection_type` + `config.media_audio_*` | **`#EXT-X-MEDIA` = 0** → no hay pista que elegir |
| **VLC** | `#EXTVLCOPT:audio-*`, y `audio-channels` **sí es real** (entre las 58 presentes del `VLC_OPT_AUDIT.md`) | sí — y por eso `audio-channels=6` **fuerza upmix** |
| **OTT Navigator / ExoPlayer / TiviMate** | ignoran `KODIPROP`; leen `EXTINF` y parte de `EXTVLCOPT` | parcialmente |

**Conclusión:** no hay una capa que «mande». Hay un **manifiesto muxed sin renditions**, unas claves
inventadas para el motor de Kodi, una opción real de VLC que se usa mal, y metadata propietaria que
ningún player implementa.

## 5 · Lo que sí recomiendo — y es por evidencia, no por preferencia de capa

1. **`PASSTHROUGH:ENABLED=true` → `false`.** Aquí no hay disputa de capas: con `#EXT-X-MEDIA = 0` no
   existe pista separada que reenviar. Es falso en las 10.573, punto.
2. **Borrar las 15 `inputstream.adaptive.audio_*` inventadas.** No pueden «ganar» porque no se leen.
   Mantenerlas solo consigue que un lector humano crea que configuran algo.
3. **Quitar `#EXTVLCOPT:audio-channels=6`** salvo que la fuente esté verificada como 6 canales. Es una
   opción **real** de VLC y por eso es la única del plano que **sí hace algo**: fuerza upmix sobre estéreo.
   Es la más peligrosa de las tres precisamente porque funciona.
4. **Si se quiere audio real separado**, hace falta `#EXT-X-MEDIA` con `URI=` — o sea, un packager. Eso no
   se arregla con metadata.

## 6 · Lo que este veredicto NO dice

- **No digo que las 90 inventadas sean inútiles por malicia.** Pueden ser un vocabulario propio del
  generador. Digo que **`inputstream.adaptive` no las lee**, y eso es verificable contra su wiki.
- **No verifiqué la página `Stream-selection-types-properties`**, así que `chooser_bandwidth_max` queda
  como `NO_VERIFICADA`, no como inventada. No encontrado no es inexistente.
- **No he probado en un Kodi real.** La evidencia es la lista de propiedades que el add-on documenta.
- **No he modificado la lista ni el VPS.**

## 7 · Reproducir

```bash
node tools/ape-parse-defects/kodiprop_key_audit.js "…APE_LISTA_1793589060441.m3u8" --json isa.json
# exit 4 si hay claves inventadas o deprecadas · 0 si todas son reales y vigentes
```