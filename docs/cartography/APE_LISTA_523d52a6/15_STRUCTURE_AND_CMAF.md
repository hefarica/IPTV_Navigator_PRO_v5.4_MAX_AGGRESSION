# La estructura real: lista de canales con forma de master playlist, y un bloque CMAF que se anula a sí mismo

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Método:** conteo total de los tags RFC 8216 en los 604 MB, más el censo de varianza.

## 1 · La estructura, medida

```
        1  #EXTM3U
    10.573  #EXTINF
        1  #EXT-X-VERSION
    10.573  #EXT-X-STREAM-INF
    10.573  #EXT-X-I-FRAME-STREAM-INF
    10.574  #EXT-X-DATERANGE

        1  #EXT-X-KEY
        1  #EXT-X-TARGETDURATION

        0  #EXT-X-MEDIA
        0  #EXT-X-MAP
        0  #EXT-X-MEDIA-SEQUENCE
        0  #EXT-X-ENDLIST
        0  #EXT-X-PART
        0  #EXT-X-PRELOAD-HINT
```

**Qué es esto:** una **lista de canales** (10.573 `#EXTINF`) donde **cada bloque tiene además forma de
master playlist** — un `#EXT-X-STREAM-INF` y un `#EXT-X-I-FRAME-STREAM-INF` y un `#EXT-X-DATERANGE` por
canal.

**Qué NO es:** un manifiesto HLS. No hay **ningún** tag de media playlist: sin `MEDIA-SEQUENCE`, sin
`ENDLIST`, sin `PART`, sin `PRELOAD-HINT`. Las listas de segmentos viven en otra parte.

Y las tres piezas que hacen falta para audio separado o para fMP4 **no están**: `EXT-X-MEDIA` = 0,
`EXT-X-MAP` = 0.

## 2 · Corrección a mi propio censo

El censo de la ronda 33 reportó `EXTM3U`, `EXTINF`, `EXT-X-VERSION`, `EXT-X-KEY` y
`EXT-X-TARGETDURATION` como **AUSENTE**. **Era un artefacto de mi herramienta, no un hecho del fichero.**

`tag_variance.js` sólo cuenta líneas **dentro** de un bloque de canal: `#EXTINF` es el separador (se
consume antes de registrar) y `#EXTM3U`, `VERSION`, `KEY` y `TARGETDURATION` están en la cabecera, antes
del primer bloque.

Los cinco existen. `KEY` y `TARGETDURATION` aparecen **exactamente una vez**, en la cabecera.

> **«No computado» no es «cero».** El censo tenía un punto ciego en la cabecera y yo estaba a punto de
> reportar cinco tags como ausentes apoyándome en él. Corregido en el informe **y en la herramienta**:
> ahora emite un bloque `fuera_de_bloque` que nunca se suma a las clases de dentro del bloque, porque un
> tag de cabecera no describe un canal.

## 2 bis · Lo que la cabecera guarda de verdad: 134 tags

Cerrado el punto ciego, la cabecera aparece como lo que es: **donde vive el plano de control**.

| Qué | Cuántos |
|---|---:|
| `EXT-X-APE-LAB-PROFILE-P0…P5` + `-BOUNDS-` + `-KNOBS-` | **18** | ← la tabla de calibración LAB completa |
| `EXT-X-APE-LAB-METADATA` (chunked) | **20** |
| `EXT-X-SESSION-DATA` | **24** |
| `EXT-X-SYS-*` (protocolo, TLS, bufer, codec, fingerprint) | **≈50** |
| `EXT-X-APE-CONTINUITY-*` | 6 |
| `EXT-X-APE-LAB-DNA`, `-SCHEMA-VARIANT`, `-EXPORTED-AT`, `-FILENAME`, `-BULLETPROOF` | 5 |
| `EXT-X-PART-INF`, `EXT-X-START` ×2, `EXT-X-SERVER-CONTROL` ×2, `EXT-X-CONTENT-STEERING`, `EXT-X-INDEPENDENT-SEGMENTS` | 7 |

> **Esto responde a «cómo lo hizo».** El mecanismo de la lista no está en los 10.573 bloques: está en
> estas 134 líneas de cabecera. Los bloques repiten constantes; **la cabecera es donde se declara la
> intención**. Y es la parte que el censo no estaba mirando.

Dos notas de esa cabecera que encajan con lo ya medido:

- **`EXT-X-PART-INF` existe una vez** en la cabecera y `EXT-X-PART` aparece **0 veces** en los bloques.
  LL-HLS declarado arriba, sin una sola parte abajo.
- **`EXT-X-APE-AUDIO-PASSTHROUGH` sale dos veces**: `:SAFE` en la cabecera y `ENABLED=true` en los 10.573
  bloques. Es exactamente lo que midió la ronda 29, ahora confirmado estructuralmente.

## 3 · F-13 · El bloque CMAF se anula en una sola línea

Los 18 tags `EXT-X-CMAF-*` son constantes en los 10.573 canales. Dos de ellos:

```
EXT-X-CMAF-CONTAINER    : "mpegts"
EXT-X-CMAF-INIT-SEGMENT : BYTERANGE="1024@0"
```

**Severidad: ALTA** · Capa: metadatos de contenedor

**CMAF significa fMP4 (ISOBMFF).** Un tag llamado `EXT-X-CMAF-CONTAINER` cuyo valor es **`mpegts`**
declara, en la misma línea, que no es CMAF. No es que falte el `EXT-X-MAP`: es que **el propio tag dice
que el contenedor es MPEG-TS**, que es justo lo contrario de lo que su nombre afirma.

Y `EXT-X-CMAF-INIT-SEGMENT` anuncia un segmento de inicialización por byterange mientras
`#EXT-X-MAP` = **0** en los 10.573 bloques. **El tag que crearía ese segmento no existe en toda la lista.**

La doctrina de este repo es explícita: *«CMAF/fmp4 falso sin `EXT-X-MAP` real — sigue PROHIBIDO»*.

## 4 · Corrección al informe de audio: son TRES capas, no dos

La ronda 29 documentó que `#KODIPROP` decía `false` y la capa `APE` decía `ENABLED=true`. **Hay una
tercera capa que también opina:**

| Capa | Atmos | DTS | TrueHD |
|---|---|---|---|
| `#KODIPROP:…audio_dolby_atmos` | **false** | false | false |
| `#EXT-X-APE-AUDIO-ATMOS` | **true** | true | true |
| `#EXT-X-CMAF-ATMOS` | **false** | false | false |

```
EXT-X-CMAF-ATMOS   : ENABLED=false,CHANNELS=7.1.4
EXT-X-CMAF-DTS     : ENABLED=false,TYPE=DTS:X
EXT-X-CMAF-TRUEHD  : ENABLED=false,CHANNELS=7.1
```

Dos capas dicen `false`, una dice `true`, y **las tres se contradicen en el mismo bloque**. La ronda 29
midió dos; el censo encontró la tercera.

## 5 · Lo que el bloque CMAF declara además, todo constante

```
EXT-X-CMAF-AI-SR    : MODEL=realesrgan,SCALE=4,ENABLED=true
EXT-X-CMAF-LCEVC    : PHASE=4,ENABLED=true
EXT-X-CMAF-VRR      : MIN=24,MAX=120,ENABLED=true
EXT-X-CMAF-DOLBY-VISION : PROFILE=8,LEVEL=6,ENABLED=true
EXT-X-CMAF-NETWORK  : TIMEOUT=60000,RECONNECT=true,COUNT=99
```

Un modelo **Real-ESRGAN** de escala 4 declarado en metadata, sobre un VPS de 3 vCPU donde el CLAUDE.md
dice que no hay motor real desplegado. `COUNT=99` reconexiones, constante.

Son declaraciones inertes (RFC 8216 §6.3.1 las ignora), pero leídas como conjunto describen un sistema
que no coincide con el medido en `VPS_REALITY_MEASURED_2026-10-25.md`.

## 6 · Una nota sobre dos familias de tags

El censo encuentra dos familias completas, ambas constantes en el 100 % de los canales:

- `EXT-X-APE-ISP-EVASION-*` (22 tags): `DPI`, `SANDVINE-BYPASS` vía `PHANTOM-HYDRA`, `TLS-SNI-OBFUSCATE`,
  `VPN-TOR`, `VPN-I2P`, `VPN-ONION`, `OBFUSCATION`, `CAMOUFLAGE`, `STEALTH`.
- `EXT-X-APE-DRM-*` (20 tags): `PLAYREADY`, `FAIRPLAY`, `CLEARKEY`, `AES128`, `AES256`, `CENC`,
  `KEY-ROTATION`.

**Estas declaraciones son metadata inerte: ningún player las ejecuta.** Pero `AGENTS.md` prohíbe
implementar evasión ilegal de proveedor/ISP y bypass de DRM, y `#EXT-X-KEY` aparece **una sola vez** (en
la cabecera), no por canal.

**No he ejecutado nada de esto ni lo ejecutaría.** Lo reporto porque es parte del fichero que se me pidió
auditar, y porque un lector que tome estos tags como capacidades reales se lleva una impresión falsa en
las dos direcciones: no hay DRM por canal aunque 20 tags lo nombren, y no hay motor de evasión aunque 22
tags lo nombren.

## 7 · Lo que este informe NO dice

- **No digo que falte CMAF y por eso algo se rompa.** Ningún reproductor lee `EXT-X-CMAF-*`; se ignoran.
  El daño es de **representación**, no de reproducción.
- **No he mirado el contenido de la cabecera entera.** El `EXT-X-KEY` y el `EXT-X-TARGETDURATION` únicos
  están ahí y no los he leído en línea; sé que existen y cuántos son.
- **No he revisado los diez mil bloques uno a uno.** Los conteos son totales; los valores, del censo que
  ya está validado contra trece controles.
- No propongo parche. Renombrar `EXT-X-CMAF-*` o poner `CONTAINER=fmp4` es decisión del generador.

## 8 · Reproducir

```bash
node -e "…"   # conteo total de los 16 tags RFC, ver §1
node tools/ape-parse-defects/tag_variance.js "…m3u8" --json scratch/tag_var.json
```
