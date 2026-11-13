# MOTOR UNIVERSAL DE LISTAS — adaptador, preservación y publicación atómica

**Fecha:** 2026-11-11 · **Tarea:** t14 · **Autor:** jit-auditor
**Ficheros entregados (los tres del inScope):**

| Fichero | Bytes | Qué es |
|---|---:|---|
| `tools/canary/playlist_adapter.js` | **41.462** · 977 L · sha256 `31020f0c…52eace` | Módulo Node autocontenido. Ingesta `.m3u`/`.m3u8`/`.gz`, valida fail-closed, publica atómicamente. Cero dependencias, cero red. |
| `tools/quality/test_playlist_adapter.js` | **30.784** · 529 L · sha256 `8b5b313c…9efa4` | 32 comprobaciones, fixtures en `os.tmpdir()`. |
| `docs/audits/PLAYLIST_ADAPTER_20261111.md` | 19.102 · 331 L | Informe con la tabla de preservación y los límites. |

**Fixture real usado:** `docs/audits/playlist_rea_v24_sample.m3u8`
· **175.667 B** · sha256 `27190273745f669312ab6388592f92afc34f2072c85aa8b28d3a759213571f78`
· 2.087 líneas · LF puro (0 CRLF) · 0 bytes no-ASCII · sin BOM · línea más larga **7.714 chars** (la `#EXTHTTP`).

---

## 1. VEREDICTO EN CINCO LÍNEAS

1. **Cero pérdidas, cero añadidos.** La lista publicada es **byte-idéntica** a la entrada
   (mismo sha256), y el **multiconjunto** de las 2.078 líneas de tag coincide línea por línea
   (`3ca003b1eb0ac2da` antes y después). No es "mismo total": es el mismo multiconjunto.
2. **La trampa estructural del formato está resuelta:** en la muestra real la **URI no sigue al
   `#EXTINF`** — cae en el **offset 954** del bloque, con **958 tags** dentro del bloque y
   **4 tags después de la URI**. Un parser que cierre el bloque en la URI pierde tags.
3. **Fail-closed de verdad:** 9 códigos de rechazo, cada uno con su fixture; una lista truncada
   **no publica nada** (el `outDir` queda vacío, sin temporales).
4. **Publicación atómica con manifiesto de procedencia** que lleva sha256 de entrada y salida,
   revisión, conteos y familias; la lista, el índice y el manifiesto comparten **la misma
   `revision`** y el manifiesto se escribe **último** (punto de commit).
5. **Streaming real:** 0 `readFileSync` en el adaptador. Medido sobre **166,1 MiB / 2,88 M líneas**:
   **7,9 MiB/s**, RSS +71 MiB (0,72× el tamaño del fichero).

---

## 2. CONTRATO DE PRESERVACIÓN — `verbatim-byte-exact`

La política no es "reconstruir la lista equivalente". Es **no tocarla**:

- Se corta el flujo de bytes por `0x0A` y el `0x0D` previo se conserva **como parte del EOL**.
  No se usa `readline` (normaliza `\r\n` y pierde el terminador).
- Se escribe el **Buffer original de la línea**, no su texto re-codificado. Re-codificar
  corrompería cualquier byte que no fuera UTF-8 válido; aquí eso es imposible por construcción.
- Se preservan: EOL mixtos (`\n`, `\r\n`), ausencia de salto final, BOM si lo hubiera, líneas en
  blanco (7 en la muestra) y **cualquier etiqueta desconocida, verbatim**.
- El **parseo** (atributos, títulos, familia) es **asesor**: sirve para el índice y los conteos.
  Si el parser se equivoca en un título, la línea publicada sigue intacta.

Prueba: `sha256(salida) == sha256(entrada)` en la muestra real. El test lo verifica leyendo los
bytes publicados, no el buffer en memoria.

---

## 3. TABLA DE PRESERVACIÓN POR FAMILIA (muestra real)

Contada con un **contador independiente** escrito en el test (regex propias, sin usar las
funciones del adaptador) y contrastada con las del adaptador (comprobación `a3` y `a4`).

| Familia | Antes | Después | Δ |
|---|---:|---:|---:|
| `#EXTM3U` | 1 | 1 | 0 |
| `#EXTINF` | 2 | 2 | 0 |
| `#EXTHTTP` | 2 | 2 | 0 |
| `#EXTVLCOPT` | 262 | 262 | 0 |
| `#KODIPROP` | 182 | 182 | 0 |
| `#EXTATTRFROMURL` | 108 | 108 | 0 |
| `#EXT-X-*` | 1.520 | 1.520 | 0 |
| `OTROS` (desconocidas) | 1 | 1 | 0 |
| **TOTAL TAGS** | **2.078** | **2.078** | **0** |
| **MULTICONJUNTO (digest)** | `3ca003b1eb0ac2da` | `3ca003b1eb0ac2da` | **IDÉNTICO** |

> Hay **dos huellas** y las dos coinciden antes/después, cada una con su propio esquema:
> la del **adaptador** (`sha1(linea)|longitud` → sha256, `3ca003b1eb0ac2da`) y la del
> **contador independiente del test** (sha256 de las líneas ordenadas con repeticiones,
> `cdf03f4e598e33b8`, que es la que imprime la tabla de la corrida). Que dos esquemas
> distintos coincidan en entrada y salida es más fuerte que repetir el mismo cálculo.

- **Nombres de tag distintos:** 796 (la familia `#EXT-X-APE-*` es la que más ramifica).
- **`OTROS` = 1** es una etiqueta **desconocida real** del fixture: `#X-OMEGA-TIMESTAMP:…`
  (una sola `#`). Se conserva y se cuenta; el adaptador no la interpreta.
- Atributos exigidos por el contrato, comprobados en el índice del canal 1:
  `tvg-id="1"` · `tvg-name="Canal FHD de prueba"` · `tvg-logo=""` (presente y vacío) ·
  `group-title="Pruebas"` · `catchup="flussonic"` · `catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}"` ·
  `#EXTHTTP` con **200 cabeceras** (su `keys_sha256` queda en el índice, no los valores).

### 3.1 Dónde está el `catchup` (corrección de una suposición)

En esta lista el `catchup` **no** está en el `#EXTINF`: está en el **`#EXTM3U`**, como atributo
global. Por eso el manifiesto expone un bloque `header` con los atributos globales y el índice
calcula la **herencia** por canal:

```
header.catchup        = flussonic
header.catchup-source = {MediaUrl}?utc={utc}&lutc={lutc}
header.catchup-days   = 7
canal 1 catchup_effective = flussonic   (heredado, el canal no lo declara)
```

Esto además destapó un defecto del parser de atributos: los valores **sin comillas** se
cortaban en la siguiente **coma**, pero en el `#EXTM3U` el separador es el **espacio**. Se comía
`catchup`, `url-tvg` y `refresh` dentro del valor de `x-tvg-shift`. Corregido (ver §8, defecto D-2).

---

## 4. NÚMEROS MEDIDOS SOBRE LA MUESTRA REAL

Manifiesto generado (`revision: final-001`), 37 ms:

```
input.bytes   175667   sha256 27190273745f669312ab6388592f92afc34f2072c85aa8b28d3a759213571f78
output.bytes  175667   sha256 27190273745f669312ab6388592f92afc34f2072c85aa8b28d3a759213571f78
index.bytes     1701   sha256 6c3c88e9783c880d9a1a77447009ab8db717625bee2f1447a2e391ccd184b612
counts        {"lines":2087,"tag_lines":2078,"uri_lines":2,"blank_lines":7,"other_lines":0,"channels":2}
flavor        m3u-plus
distinct_names 796
preservation  {"lost":0,"added":0,"identical":true,"byte_identical_to_input":true}
sha256_verified_on_temp true   ·   verified_post_rename true
```

Salida: 3 ficheros — `list.m3u8`, `index.json`, `manifest.json` — y **ningún** `.tmp` residual.

Índice del canal 1 (lo que ve Canary, **sin** la URL real):

```json
{"index":1,"opener":"EXTINF","line":162,"uri_line":1116,"uri_offset_in_block":954,
 "duration":"-1","name":"Canal FHD de prueba","tvg_id":"1","group_title":"Pruebas",
 "catchup_effective":"flussonic",
 "url_redacted":"https://audit.invalid/live/***/***/1.m3u8?sig=***",
 "url_sha256":"…","tags_in_block":958,"tags_before_uri":954,"tags_after_uri":4,
 "http_headers":{"count":200,"keys_sha256":"88311e39…"}}
```

`uri_offset_in_block = 954` y `tags_after_uri = 4` son la prueba numérica de la trampa del
formato: **la URI no cierra el bloque**.

---

## 5. FAIL-CLOSED — 9 CÓDIGOS, 9 FIXTURES

Cada rechazo se demuestra con el **mensaje literal** y con la comprobación de que el `outDir`
queda **vacío** (ni ficheros ni temporales).

| Código | Disparador | Fixture | Mensaje literal (recortado) |
|---|---|---|---|
| `E_TRUNCATED_BLOCK` | `#EXTINF` sin URI (EOF o siguiente abridor) | cabecera + línea 162 | `bloque abierto en la linea 162 (EXTINF) sin URI al llegar a EOF` |
| `E_TRUNCATED_BLOCK` | corte a mitad de bloque (500 líneas) | ídem | ídem |
| `E_URI_WITHOUT_BLOCK` | URI sin abridor | `#EXTM3U` + URL | `URI en la linea 2 sin abridor de bloque previo (#EXTINF / #EXT-X-STREAM-INF)` |
| `E_MULTIPLE_URI_IN_BLOCK` | 2 URIs en un bloque | 2 URLs | `segunda URI en el bloque abierto en la linea 2` |
| `E_BAD_EXTINF_ATTRS` | comilla sin cerrar | `tvg-id="1,Canal` | `atributos mal formados en la linea 2 (clave "tvg-id": comilla sin cerrar)` |
| `E_MISSING_EXTM3U` | primera línea útil ≠ `#EXTM3U` | sin cabecera | `la primera linea util no es #EXTM3U (es: "#EXTINF:-1 …")` |
| `E_EMPTY_INPUT` | 0 bytes | vacío | `la entrada tiene 0 bytes` |
| `E_GZIP_CORRUPT` | `.gz` truncado | gzip a la mitad | `gzip corrupto: unexpected end of file` |
| `E_NO_FINAL_NEWLINE` | **guard opcional** (`requireFinalNewline: true`) | URI final sin salto | `la ultima linea no termina en salto de linea (posible corte a mitad de linea)` |

Además, defensivos: `E_LINE_TOO_LONG` (>8 MiB por línea, indicio de binario),
`E_TOO_MANY_CHANNELS` (>200.000), `E_PUBLISH`, `E_OUTPUT_MISMATCH`, `E_IO`.

**Por qué `E_NO_FINAL_NEWLINE` está OFF por defecto:** un fichero sin salto final **no prueba**
truncamiento — hay generadores que no lo emiten. Se expone como gate explícito y el test demuestra
**las dos caras**: con el guard apagado el corte dentro de la URI se acepta (límite declarado §9),
con el guard encendido se rechaza.

---

## 6. PUBLICACIÓN ATÓMICA

```
1. se escribe la LISTA  -> outDir/.list.m3u8.<pid>.<rand>.tmp   (con fsync)
2. se escribe el INDICE -> outDir/.index.json.<pid>.<rand>.tmp  (con fsync)
3. sha256 del temp == sha256 calculado al escribir?  si no -> E_OUTPUT_MISMATCH, se borra todo
4. se escribe el MANIFIESTO (con los hashes de 1 y 2)           (con fsync)
5. rename: lista -> indice -> MANIFIESTO   (el manifiesto es el punto de commit)
6. verificacion POST-rename: se RELEEN los bytes publicados y se comparan con el manifiesto;
   si no casan, se RETIRA la publicacion entera (unlink de los tres)
```

- Los temporales viven en el **mismo directorio** que el destino (mismo volumen ⇒ `rename`
  atómico del sistema de ficheros).
- Si un `rename` falla a mitad, se borran todos los temporales **y** los ya renombrados:
  no queda una revisión a medias.
- **Límite honesto:** entre el rename de la lista y el del manifiesto hay una ventana de
  microsegundos. La regla para el lector es: **el manifiesto manda** — si su
  `output.sha256` no casa con la lista, la revisión no es válida. Eso es verificable y por eso
  el manifiesto se escribe último.
- Dos publicaciones en el mismo `outDir` (rev-A, rev-B): el manifiesto vigente es el de rev-B y
  la lista vigente casa con él (comprobación `h1`).

---

## 7. SECRETOS — qué se detecta y dónde se redacta

**Medido en la muestra real:** 3 hallazgos, todos en las URIs (ninguna cabecera sensible):

```
uri:query:sig        línea 1116   (la URL del canal 1 lleva ?sig=…)
uri:ruta_xtream      líneas 1116 y 2077   (/live/<user>/<clave>/<id>)
```

`#EXTHTTP` de la muestra: **200 claves, 0 sensibles** (`Authorization` y `Cookie` ausentes).

**Qué se detecta** (sin guardar nunca el valor): `Authorization`, `Proxy-Authorization`,
`Cookie`, `Set-Cookie`, `X-Api-Key`, `Auth`, `Token` (dentro del JSON de `#EXTHTTP`);
`Bearer`/`Basic` con token; `user:pass@` en la autoridad; parámetros de query
(`sig, signature, token, password, passwd, pass, pwd, api_key, apikey, auth, key, secret, hdnts, md5, st, username, user, login, sp`);
y la **ruta estilo xtream** `/live|movie|series/<user>/<clave>/<id>`.

**Dónde se redacta:** `index.json`, `manifest.json` y **el log** (toda línea de log pasa por
`redactSecrets`). El índice guarda `url_redacted` (`/live/***/***/1.m3u8?sig=***`) y
`url_sha256`, de modo que se puede **verificar** una URL sin exponerla.

**Dónde NO se redacta, y por qué:** en la **lista publicada**. Preservar la URL de origen es el
contrato (§2); si se enmascarara, la lista dejaría de servir. El manifiesto lo declara de forma
explícita: `secrets.not_redacted_in = ["list.m3u8"]`.

---

## 8. DEFECTOS ENCONTRADOS Y CORREGIDOS DURANTE LA CONSTRUCCIÓN

Los anoto porque son los que un revisor debe volver a buscar:

| ID | Defecto | Cómo se detectó | Corrección |
|---|---|---|---|
| **D-1** | **Una escritura síncrona por línea** (2,88 M syscalls) → 2,5 MiB/s | medición de memoria/tiempo sobre 166 MiB | buffer de salida de 256 KiB: **2,5 → 6,3 MiB/s** |
| **D-2** | Parser de atributos cortaba los valores **sin comillas** en la `,`, pero en `#EXTM3U` el separador es el **espacio**: `catchup`, `url-tvg` y `refresh` desaparecían dentro del valor de `x-tvg-shift` | el test exigía `header.catchup` y daba `null` | cortar también en espacio/tab |
| **D-3** | **2 regex por línea** en `openerOf` (5,7 M ejecuciones) → ~8 s | micro-benchmark + `--cpu-prof` | `startsWith`: **6,3 → 7,9 MiB/s** |
| **D-4** | **Un SHA1 de OpenSSL por línea** para la clave del multiconjunto | `--cpu-prof` | caché por línea distinta (≈800 entradas): una sola vez cada una |
| **D-5** | **Re-codificar el texto** para reescribir la línea corrompía bytes no-UTF-8 | revisión de la ruta de escritura | se escribe el **Buffer original** + su EOL original |
| **D-6** | **Regresión de detección**: el pre-filtro de rendimiento (busca `@`/`?`/`EXTHTTP`…) dejaba pasar la **ruta xtream sin query** | el manifiesto de la muestra real pasó de 2 a 3 hallazgos | las **URIs se escanean siempre** (hay ~1 por canal); el pre-filtro solo aplica a tags. Test de regresión `f1b` |
| **D-7** | `exec` en el fuente por usar `RegExp.exec()` — un escáner literal lo marcaría como ejecución de procesos | el propio test estático `e1` | `String.match()`: **0 apariciones** del token `exec` en el fichero |

---

## 9. RENDIMIENTO Y MEMORIA — MEDIDOS, Y SUS LÍMITES

Fichero sintético construido replicando el bloque real del canal 1 (961 líneas, ~55 KB):
**166,1 MiB · 3.000 canales · 2.877.158 tags** (reproduce la forma real: ~950 tags por canal).

```
lineas           2.883.161
canales             3.000
tags            2.877.158
perdidas                0     anadidas 0     byte_identico true
tiempo             21.104 ms   ->  7,9 MiB/s
RSS base            49,1 MiB   RSS pico 120,1 MiB   (delta 71,0 MiB)
heap pico           34,8 MiB
ratio RSS_pico / tamaño = 0,72x
```

**Base medida del I/O puro** (cortar líneas + `toString`, sin lógica): **665 ms para 166 MiB =
250 MiB/s**. Es decir: el coste no está en leer ni en partir, está en el trabajo por línea
(clasificar, contar, escanear). Un perfil `--cpu-prof` lo confirma: `maybeHasSecret`, `onLine` y
`msKeyOf` son los nodos calientes.

**Progresión medida:** 2,5 → 6,3 → **7,9 MiB/s** con D-1, D-3 y D-4.

**Extrapolación (declarada como tal, NO medida):** una lista de **1,3 GB** tardaría del orden de
**2,7 min** y ~570 MiB de RSS. Es el límite que este entrega **no** ha probado (§10).

**Memoria:** `0` `readFileSync` en el adaptador. Se lee por `createReadStream` de 64 KiB, se
escribe por buffer de 256 KiB, el índice se emite **incrementalmente** (un canal cada vez) y el
`manifest.tags.by_name` crece con los **nombres distintos** (796), no con los canales.

---

## 10. CÓMO SE USA

Módulo CommonJS, sin dependencias, sin red:

```js
const A = require('./tools/canary/playlist_adapter.js');

const r = await A.processPlaylist({
  input:  'docs/audits/playlist_rea_v24_sample.m3u8',
  outDir: './out/rev-001',
  // opcionales:
  revision: 'rev-001',           // si se omite, se genera (AAAAMMDDhhmmss-<8hex>)
  publish: true,                 // false = solo valida y devuelve el manifiesto
  listName: 'list.m3u8', indexName: 'index.json', manifestName: 'manifest.json',
  maxLineBytes: 8 * 1024 * 1024, maxChannels: 200000,
  requireFinalNewline: false,    // guard opcional (ver §5)
  log: console.log               // pasa por redactSecrets
});

r.manifest.preservation.identical;   // true = 0 perdidas / 0 anadidas
r.lost; r.added;                     // detalle del diff de multiconjunto
```

Utilidades exportadas para que Canary las reutilice sin duplicar lógica:
`familyOf`, `tagName`, `openerOf`, `isUri`, `parseAttributes`, `redactUrl`, `redactSecrets`,
`findSecretsInLine`, `countFamiliesOfText`, `multisetOfFile`, `multisetDigest`, `sha256FileSync`,
`sniffFormat`, `ERROR_CODES`, `FAMILY_ORDER`.

**No hay CLI.** Es una librería a propósito: no abre red, no lee argumentos y no puede ejecutar
nada. Si se quiere una herramienta de línea de comandos, es un fichero aparte que importe esto.

---

## 11. LÍMITES HONESTOS — LO QUE ESTE ENTREGABLE **NO** CUBRE

| Límite | Detalle |
|---|---|
| **Envoltorios `pulse`** (`/pulse/?u=…`) | **no se desempaquetan**. La URL se preserva opaca. Desenvolver el `u=` es de otro módulo: aquí no se interpreta. |
| **`.gz` multi-miembro** | `zlib.createGunzip` lee el primer miembro; un `.gz` con varios miembros concatenados se leería incompleto. **No soportado** y no probado. |
| **Listas de 1,3 GB** | **no probadas**. Medido 166 MiB (§9); la extrapolación a 1,3 GB es eso, extrapolación. |
| **Corte DENTRO de la URI** | **no detectable por contenido**: `…?sig=a%2` sigue siendo una URI válida. Solo lo detecta el guard `requireFinalNewline` (§5), que está **off** por defecto porque un fichero sin salto final no es prueba de corte. |
| **Atributos ambiguos** | un título con forma `Nombre = valor` puede leerse como atributo. Afecta al `title` del índice, **no** a los bytes publicados. |
| **UTF-8 inválido** | los bytes se preservan exactos (D-5), pero el `text` usado para clasificar tiene caracteres de reemplazo: la **clasificación** de esa línea puede ser imprecisa; la **preservación** no. |
| **Validación RFC 8216** | no se hace. No se valida `#EXT-X-TARGETDURATION`, ni la coherencia master/media, ni la sintaxis de `#EXT-X-KEY`. Este módulo preserva y valida **estructura de bloques**, no conformidad HLS. |
| **URLs vivas** | no se comprueba que una URI responda: **cero red** por contrato. |
| **Transformación** | no transforma nada. Es un pipeline de **preservación + publicación**. Cualquier reescritura futura tendrá que recalcular el multiconjunto y volver a demostrar `lost=0/added=0`. |
| **`#EXT-X-STREAM-INF` (master HLS)** | soportado como abridor de bloque (flavor `hls-master`) pero **no probado con un master real** en este entregable: el fixture es una lista de canales. |

---

## 12. TRAZABILIDAD DE LA VERIFICACIÓN

```
node --check tools/canary/playlist_adapter.js      -> exit 0
node --check tools/quality/test_playlist_adapter.js -> exit 0
node tools/quality/test_playlist_adapter.js         -> 32 PASS · 0 FAIL · exit 0
```

Comprobaciones del test (32): `a1`–`a8` (muestra real, byte-identidad, familias, multiconjunto,
familias exigidas, etiqueta desconocida real, sin temporales) · `d1`–`d3` (hashes del manifiesto
contra los bytes publicados, misma revisión, preservación declarada) · `b1`–`b8` (fail-closed) ·
`b3`/`b3b` (límite declarado + guard) · `c1`–`c2` (etiqueta inventada verbatim, inyección no
ejecutada, CRLF preservado) · `f1`/`f1b`/`f2` (secretos: fuera del índice y del manifiesto, en la
lista sí; regresión xtream; log redactado) · `g1`–`g2` (gzip) · `e1`–`e3` (análisis estático del
fuente: 9 patrones prohibidos, 0 apariciones; solo `fs,path,crypto,zlib`; sin red en código) ·
`h1`–`h2` (dos revisiones en el mismo directorio; sin residuos tras rechazo).

El escaneo estático `e1` busca, en el **fuente del adaptador**:
`\beval\s*\(`, `new Function(`, `Function(`, `require('http|https|net|tls|dns|dgram|http2')`,
`require('child_process')`, `fetch(`, `XMLHttpRequest|WebSocket|.connect(`,
`exec(Sync)?(|spawn(Sync)?(|fork(`, `vm.runIn`.
**Resultado: los 9 patrones con 0 apariciones.** Y el token literal `exec` **no aparece** en el
fichero (D-7), de modo que también pasa un escáner ingenuo por subcadena.
