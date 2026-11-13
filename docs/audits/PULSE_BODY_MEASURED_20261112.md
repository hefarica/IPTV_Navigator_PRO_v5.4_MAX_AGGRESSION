# Qué devuelve `/pulse/` de verdad · 2026-11-12

**La pregunta:** el televisor pide `/pulse/<id>.m3u8`. ¿Viaja ahí la metadata APE o es un pasamanos del proveedor?

**La respuesta medida:** es un **pasamanos registrado**. El cuerpo es el manifiesto del proveedor sin una sola directiva APE.

## La petición y la respuesta

```
GET /pulse/548062.m3u8?u=<proveedor>   (UA: OTT Navigator/1.7.3.3 · Android)

HTTP 200 · 655 B · Content-Type: application/x-mpegURL
Cache-Control: no-store, must-revalidate, no-cache
X-APE-Pulse: logged;mode=proxy;zapping=0;cache=miss;kind=media
```

La cabecera `X-APE-Pulse` sí es rica: dice que la petición se **registró** (`logged`), el modo elegido (**`proxy`**), que no fue un zapping (`zapping=0`), que hubo **fallo de caché** (`cache=miss`) y que el recurso es `kind=media`.

## El cuerpo, entero

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:708
#EXT-X-ALLOW-CACHE:YES
#EXT-X-TARGETDURATION:12
#EXTINF:12.000000,
http://192.142.25.8:80/hls/cce430d149087111204d842184921c22/548062_708.ts
#EXTINF:8.000000,
http://192.142.25.8:80/hls/7c30778356e94da3a6eebfdfe98aa7d2/548062_709.ts
#EXTINF:12.000000,
http://192.142.25.8:80/hls/c98c55ad09f151014400baa777364e88/548062_710.ts
#EXTINF:8.000000,
http://192.142.25.8:80/hls/a568952da0894a3fe0acb412beff0539/548062_711.ts
#EXTINF:12.000000,
http://192.142.25.8:80/hls/7f8d05b4a0c96a02793e49a6dc505367/548062_712.ts
#EXTINF:8.000000,
http://192.142.25.8:80/hls/1e5c38abe8c16deec55016713f3b1364/548062_713.ts
```

## Búsqueda de directivas en el cuerpo

| Directiva | ¿Presente? |
|---|---|
| `#EXT-X-APE` | **ausente** |
| `#EXTHTTP` | **ausente** |
| `#EXTVLCOPT` | **ausente** |
| `#KODIPROP` | **ausente** |
| `#EXT-X-APE-DECLARED` | **ausente** |
| `#EXT-X-APE-ENHANCE-STATE` | **ausente** |
| `CODECS=` | **ausente** |
| `RESOLUTION=` | **ausente** |

**Ninguna.** El envoltorio pulse registra la petición, elige modo y devuelve el manifiesto del proveedor sin tocar.

## Lo que esto significa, sin adornos

1. **La cadena APE sí está en el camino** — el televisor no va directo al proveedor, pasa por `/pulse/`. Eso está medido y es real.
2. **Pero lo que aporta a la reproducción es registro y elección de modo, no metadata.** En este endpoint, ni perfiles, ni códecs declarados, ni cabeceras HTTP por canal.
3. **`mode=proxy` es la decisión correcta para este reproductor.** La doctrina del envoltorio dice que `m=cartridge` solo se sirve a VLC/LibVLC/Kodi/LibreELEC; OTT Navigator debe degradarse a `proxy`. **Medido: se degrada, con el UA de OTT Navigator.** La doctrina funciona.
4. **Los segmentos van al proveedor** (`192.142.25.8:80/hls/…`), no al VPS. Coherente con lo medido ayer: las 40 respuestas `206` del VPS eran todas sobre `/lists/*.m3u8`, ninguna sobre segmentos.

## Dos observaciones técnicas del propio manifiesto

- **`#EXT-X-ALLOW-CACHE:YES`** es una etiqueta **retirada** del RFC 8216 moderno. Los reproductores la ignoran (OTT Navigator aparentemente sí, porque reproduce), pero está ahí heredada del proveedor.
- **`#EXT-X-TARGETDURATION:12`** con segmentos alternando **12 s y 8 s**: válido (ninguno supera el target), pero son segmentos muy largos para IPTV en directo. Explica el refresco observado de ~20 s: el player pide el manifiesto cuando le falta contenido, y con segmentos de 12 s eso cae en ~20 s.

## El coste que revela `cache=miss`

Cada refresco del player **vuelve a pedir el manifiesto al proveedor** (`cache=miss`, `Cache-Control: no-store`). Con un televisor son ~3 peticiones/minuto; con varios aparatos se multiplica. No lo califico de problema —puede ser deliberado para no servir un manifiesto desfasado— pero es un hecho medido y no estaba escrito en ningún sitio.

## La otra capa: el catálogo SÍ lleva la metadata

Medido con `Range: bytes=0-12000` sobre tres listas públicas (HTTP **206** en las tres):

| Lista | Directivas APE encontradas |
|---|---|
| `APE_LISTA_1794100720046` | `#EXT-X-APE` |
| `APE_LISTA_1793926685925` | `#EXT-X-APE` |
| `APE_PRUEBA_PERFILES` | `#EXT-X-APE` · `#EXTVLCOPT` · `#KODIPROP` · `CODECS=` · `RESOLUTION=` |

Y el contenido real de la cabecera de canal:

```
#EXTINF:-1 tvg-id="47" tvg-name="|AL| KLAN MACEDONIA 4K [line.tivi-ott.net]" ...
  ape-profile="P1" ape-build="v5.4-MAX-AGGRESSION" ape-region="und"
  ape-content-type="GENERALISTA" ape-fps="25" ape-transport="HLS" ape-codec-family="hevc"
#EXTVLCOPT:network-caching=72000
#EXTVLCOPT:codec=hevc,av1,h264
#EXTVLCOPT:avcodec-hw=any
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Web0S; Linux/SmartTV) ...
#EXTVLCOPT:network-reconnect-count=215
```

**La arquitectura, entonces, es de dos capas y es coherente:**

| Capa | Ruta | Qué lleva |
|---|---|---|
| **Catálogo** | `/lists/*.m3u8` | Toda la metadata APE: perfil, familia de códec, fps, y ~30 `#EXTVLCOPT` por canal |
| **Manifiesto de media** | `/pulse/<id>.m3u8` | El HLS del proveedor, **sin tocar** |

El reproductor lee el catálogo, recibe las opciones por canal, y luego pide la URL del canal — que devuelve HLS plano. **La metadata no acompaña al flujo; viaja en el índice.** Para OTT Navigator eso es lo que hay: la mejora no va en los segmentos.

## Un dato que conviene no leer de más

`ape-profile="P1"` en un canal llamado «KLAN MACEDONIA 4K», con `ape-fps="25"` y `ape-codec-family="hevc"`. P1 corresponde a 4K/UHD en la escalera documentada.

**Lo que esto NO prueba:** que el canal sea 4K de verdad ni que el player reciba HEVC. Es una **declaración** del generador sobre el canal. Y lo medido ayer en el televisor fue lo contrario: **AVC 1080p decodificado** en el canal que estaba reproduciendo (548062). Son canales distintos, no una contradicción — pero deja claro que la declaración del catálogo y lo que decodifica el aparato son dos cosas que hay que medir por separado.

## Y una advertencia sobre esas 30 líneas `#EXTVLCOPT`

`#EXTVLCOPT` es una extensión **de la familia VLC**. Que un reproductor la honre depende del reproductor: VLC y libVLC sí; la mayoría de clientes Android con su propio motor, no necesariamente.

**Si OTT Navigator honra `#EXTVLCOPT` está sin medir.** Lo que sí está medido: el catálogo las emite (una por canal, decenas por canal) y el aparato reproduce AVC 1080p. **Que la metadata esté emitida no prueba que se aplique** — es exactamente la distinción que separa «declarado» de «ejecutado», y aquí no la he cerrado.

## Lo que esto NO dice

- **No dice que las listas carezcan de APE.** Los `/lists/*.m3u8` (el catálogo de canales) son otra capa y **sí** llevan las directivas del generador. Lo medido aquí es **solo el manifiesto de media por canal**.
- **No dice que el sistema no mejore la imagen.** Dice que en esta ruta no viaja metadata que lo pida.
- **No medido:** el cuerpo de un `/lists/*.m3u8` real, para comparar las dos capas. Queda pendiente y es el siguiente paso natural.
