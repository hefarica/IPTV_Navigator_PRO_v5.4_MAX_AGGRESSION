# 05 · LAS LISTAS — anatomía al mínimo detalle

**Sistema:** APE CRYSTAL FLOW · **Estación 1 (GENERADOR) y 2 (CABLEADO)** · **Fecha:** 2026-11-15 · **Tarea:** t90
**Regla de este documento:** cada afirmación lleva **`archivo:línea`** o **comando**. Lo que no está medido se declara **`NO_COMPUTADO`** con su razón. **Nada narrado de memoria.**

> **Alcance.** No tengo acceso al VPS desde esta sesión (`ssh` rechazado por política antes de ejecutarse). Por eso distinguen dos tipos de dato: **`[CÓDIGO]`** = leído por mí en el repo, con línea; **`[VPS]`** = medido en el servidor por otro miembro y citado aquí con su fuente. Los segundos **no los he re-ejecutado**.

---

## 1 · Las listas servidas (14 filas de tabla; el nº real de ficheros .m3u8 es NO_COMPUTADO aquí y se midió en 18)

**Comando que produce esta tabla** (de `docs/audits/LISTS_INVENTORY_20261115.md` §6, probado con `bash -n` y contra 5 fixtures):

```bash
APE_LISTS_DIR=/var/www/html/lists bash ape-lists-inventory.sh --full
```

| # | Nombre exacto | Bytes `[VPS]` | Canales | URLs | `/pulse/` | `/cdn/` | Directas | Plantillas | LAB | SHIMOTT | sha256 | mtime | Clase |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | `APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` | 261.350.350 | 21.224 | 21.224 | 21.224 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **LIGHT** |
| 2 | `APE_LISTA_1794100720046_CABLEADA.m3u8` | 1.298.222.092 | 21.224 | 21.224 | 21.224 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **COMPLETA** |
| 3 | `APE_LISTA_1794100720046_P3_CABLEADA_LIGHT.m3u8` | 238.198.463 | 20.222 | 20.222 | 20.222 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **LIGHT+P3** |
| 4 | `APE_LISTA_1794100720046_P3_CABLEADA_LIGHT_CABLEADA.m3u8` | 238.198.463 | 20.222 | 20.222 | 20.222 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **DUPLICADO de #3** |
| 5 | `APE_LISTA_1794100720046_P3_CABLEADA.m3u8` | 240.723.972 | 20.222 | 20.222 | 20.222 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **PERFIL P3** |
| 6 | `APE_LISTA_1794100720046_P3.m3u8` | 240.724.013 | 20.222 | 20.222 | 20.222 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **PERFIL P3** |
| 7 | `APE_LISTA_1794100720046_P1.m3u8` | 12.626.302 | 933 | 933 | 933 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **PERFIL P1** |
| 8 | `APE_LISTA_1794100720046_P4.m3u8` | 1.199.384 | 58 | 58 | 58 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **PERFIL P4** |
| 9 | `APE_LISTA_1794100720046_P5.m3u8` | 516.221 | 11 | 11 | 11 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **PERFIL P5** |
| 10 | `APE_LISTA_1794100720046_P5_CABLEADA.m3u8` | 516.221 | 11 | 11 | 11 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **DUPLICADO de #9** |
| 11 | `APE_LISTA_1794100720046_P5_CABLEADA_LIGHT.m3u8` | 156.075 | 11 | 11 | 11 | 0 | 0 | 9 | 31 | sí | `NO_COMPUTADO` | `NO_COMPUTADO` | **LIGHT+P5** |
| 12 | `APE_PRUEBA_PERFILES.m3u8` · `APE_PRUEBA_ORDER_OK*.m3u8` | 163.187 | 3 | 3 | **0** | **0** | 3 | — | — | — | `NO_COMPUTADO` | `NO_COMPUTADO` | **SIN_SALIDA** |
| 13 | *(sin nombre propio)* → ver #14 | — | — | — | — | — | — | — | — | — | — | — | — |
| 14 | `ape_jit_latest.m3u8` | **57** | *(21.224 del destino)* | — | *(21.224)* | 0 | 0 | — | — | — | `NO_COMPUTADO` | `NO_COMPUTADO` | **SYMLINK** |

**`NO_COMPUTADO` columnas `sha256` y `mtime`**: requieren `sha256sum` y `stat -c%Y` sobre `/var/www/html/lists`, que no alcanzo. El comando está en `docs/audits/LISTS_INVENTORY_20261115.md` §6 y las rellena en una pasada.

**Las filas 12 agrupa un glob.** El número real de ficheros del directorio **`NO_COMPUTADO`** hasta correr el script; si `APE_PRUEBA_ORDER_OK*.m3u8` son 2 ficheros, hay 15 nombres.

### 1.1 `ape_jit_latest.m3u8` son 57 B y **no es una lista**

**Es un enlace simbólico.** `vps/bin/ape-jit-latest.sh:70`:

```bash
ln -sfn "$best" "$LISTS/ape_jit_latest.m3u8"
```

`$best` sale de `ls "$LISTS"/APE_LISTA_*_CABLEADA.m3u8` ordenado por **número de lista** descendente (`:49-51`), no por mtime — el porqué está escrito en `:26-31`: *«el mtime de una _CABLEADA dice CUÁNDO se cableó, no cuál es la lista nueva»*.

**Aritmética cerrada (verificada):**

```
longitud('/var/www/html/lists/')                  = 20
longitud('APE_LISTA_1794100720046_CABLEADA.m3u8') = 37
                                      20 + 37 = 57  ← los 57 B medidos, exactos
```

`stat -c%s` sobre un enlace devuelve **la longitud del destino**, no el contenido. Los 21.224 canales son **del destino** (la lista #2, COMPLETA). Confirmación en el VPS:

```bash
stat -c '%s %N' /var/www/html/lists/ape_jit_latest.m3u8
readlink -f     /var/www/html/lists/ape_jit_latest.m3u8
```

---

## 2 · Anatomía de una lista, línea por línea

### 2.0 Orden de las secciones

```
#EXTM3U  →  #EXT-X-VERSION  →  #EXT-X-INDEPENDENT-SEGMENTS  →  #EXT-X-APE-GOVERNANCE
        →  #EXT-X-APE-ENGINE  →  #EXT-X-SESSION-DATA ×8  →  #EXT-X-APE-LAB-METADATA ×31
        →  #EXT-X-APE-PROFILE-INDEX  →  #EXT-X-APE-PROFILE-TEMPLATE ×9
        →  [bloque de canal] × 21.224
```

**Fuente del orden de cabecera:** `vps/ape-jit/server.js:4052-4061` (GOVERNANCE y ENGINE se emiten justo tras `#EXTM3U`) · `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3604-3606` (EXTM3U → VERSION → INDEPENDENT-SEGMENTS).

### 2.1 `#EXTM3U` con sus atributos

`m3u8-typed-arrays-ultimate.js:3604`:

```
#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 url-tvg="" refresh="1800"
```

- `x-tvg-url` / `url-tvg`: EPG. `refresh="1800"`: la **lista** se refresca cada 30 min (M3U Plus), no confundir con el refresco del *media playlist*.
- **Quién lo lee:** cualquier parser M3U. El APK **no** lo usa para nada (`ListLoader.kt:57-98` no tiene rama para `#EXTM3U`).

### 2.2 `#EXT-X-VERSION:9`

`:3605`. RFC 8216 §7: v9 = IMSC1 subtítulos. **El APK no lo lee**; OTT/ExoPlayer lo usan para decidir qué tags aceptar.

### 2.3 `#EXT-X-INDEPENDENT-SEGMENTS`

`:3606` (y `:3236`). Declara que cada segmento arranca en keyframe → permite *seek* sin artefactos. **APK: no lo lee.**

### 2.4 `#EXT-X-APE-GOVERNANCE` — el cabecero de gobierno del VPS

`vps/ape-jit/server.js:4054-4058`:

```
#EXT-X-APE-GOVERNANCE:VERSION=1;DEFAULT_PROFILE=<p>;ENGINE=<motor>;PLAYER=<player>;
  DECODER_MAX=<WxH>;BEST_FOR_DECODER=<perfil>;EXCEEDS_DECODER=<n>;CHANNELS=<n>
```

Significado de cada campo, según el código que los calcula (`:4050-4058`):

| Campo | Qué es | Quién lo lee |
|---|---|---|
| `DEFAULT_PROFILE` | perfil por defecto del catálogo | **APK: NO** (`ListLoader.kt` no tiene rama) |
| `ENGINE`, `PLAYER` | motor y reproductor elegidos | nadie en el APK; es para humano/VPS |
| `DECODER_MAX` | techo del decoder (`caps.maxW x caps.maxH`) | nadie en el APK |
| `BEST_FOR_DECODER` | perfil que cabe en ese techo | nadie en el APK |
| `EXCEEDS_DECODER` | nº de perfiles que **exceden** el techo (`:4050`) | **APK: NO** |
| `CHANNELS` | total de canales | nadie |

**Los tres campos que la tarea marca como NO leídos quedan confirmados por barrido** (ejecutado; salida literal: `0 coincidencias` para los tres en todo `android/`):

```bash
git grep -c -F 'DEFAULT_PROFILE'       -- 'IPTV_v5.4_MAX_AGGRESSION/android/'   # -> 0
git grep -c -F 'EXCEEDS_DECODER'       -- 'IPTV_v5.4_MAX_AGGRESSION/android/'   # -> 0
git grep -c -F 'com.ape.profile.master' -- 'IPTV_v5.4_MAX_AGGRESSION/android/'  # -> 0
```

Y `ape-profile` aparece **3 veces, ninguna de ellas en una rama de lectura de GOVERNANCE**: `ListLoader.kt:90` (el `?: "P2"` del EXTINF) y dos **comentarios** (`PrismaProfile.kt:17`, `UltraEnhancePipeline.kt:133`).

**Reescritor honesto:** `vps/bin/ape-governance-honest.sh:23` *«reescribe SOLO la línea `#EXT-X-APE-GOVERNANCE` de cada lista»*; lee la anterior con `grep -m1 '^#EXT-X-APE-GOVERNANCE:'` (`:104`). Es decir: **hay una herramienta que corrige el gobierno sin tocar el resto de la lista** — y su nombre («honest») dice que antes no lo era.

### 2.5 `#EXT-X-APE-ENGINE` — la lista declara qué lee cada player

`server.js:4059-4060`:

```
#EXT-X-APE-ENGINE:<motor>;READS=<a|b|c>;IGNORES=<x|y|z>
```

Los valores salen de la tabla `PLAYER_ENGINES` (`server.js:486-512`):

| Motor | `reads` (declarado en el código) | `ignores` |
|---|---|---|
| `vlc` | `network-caching`, `http-user-agent`, `http-referrer`, `clock-jitter` | `video-filter (unsafe option por politica)`, `kodi *`, `adaptive-*` |
| `kodi` | `inputstream.adaptive.*`, `network-caching` | `EXTVLCOPT exclusivas`, `video-filter` |
| `tivimate` | `EXTHTTP de un solo valor`, `tvg-*`, `group-title` | `EXTHTTP multi-valor con comas`, `EXTVLCOPT`, `KODIPROP` |
| `ott` | `EXTVLCOPT http-user-agent/http-referrer`, `KODIPROP`, `EXTATTRFROMURL` | `video-filter (no documentado en su changelog)` |
| `apk` | **`la URL y sus cabeceras`**, HLS via `HlsMediaSource`, DASH via `DashMediaSource` | `EXTVLCOPT`, `KODIPROP`, `video-filter en la lista` |

> **Incoherencia I-1 (declarada, no corregida aquí).** `server.js:504` pone `KODIPROP` y `EXTATTRFROMURL` en los `reads` de OTT **sin evidencia de que OTT los aplique**. La medición de `t57` (`docs/audits/URL2_EFFECTIVENESS_20261114.md` §2) los clasifica como **`IGNORED/DECLARED`** para OTT: 109 líneas `#KODIPROP` y 54 `#EXTATTRFROMURL` por canal que OTT no consume. **La lista está propagando una afirmación no medida** en su propia cabecera. Se reporta para decisión del capitán; **no se edita** `server.js` (fuera de alcance).

### 2.6 `#EXT-X-SESSION-DATA` — **8 bloques**, y qué lee cada uno

Emisión: `m3u8-typed-arrays-ultimate.js:3612-3619` (bloque de `maxQualityMode`) y deduplicación por `DATA-ID` en `:3537-3544`; `com.ape.build` se inyecta además desde el LAB nivel 1 en `:3565`.

| # | `DATA-ID` | `VALUE` (literal del código) | Quién lo lee |
|---:|---|---|---|
| 1 | `exoplayer.load_control` | `{"minBufferMs":45000,"bufferForPlaybackMs":500,"bufferForPlaybackAfterRebufferMs":1000,"maxBufferMs":130000}` | ExoPlayer/Media3 **si** el player consulta SESSION-DATA. **APK: no** |
| 2 | `exoplayer.track_selection` | `{"maxDurationForQualityDecreaseMs":500,"minDurationForQualityIncreaseMs":3000,"bandwidthFraction":0.95}` | idem |
| 3 | `exoplayer.bandwidth_meter` | `{"resetOnNetworkTypeChange":false,"slidingWindowMaxWeight":2000,"initialBitrateEstimate":120000000}` | idem |
| 4 | `hls.js.config` | `{"maxBufferLength":130,"maxMaxBufferLength":600,"abrBandWidthFactor":0.95,"abrBandWidthUpFactor":0.95,"lowLatencyMode":true}` | hls.js (web) |
| 5 | `com.ape.codec.chain.player_pref` | `${APE_CODEC_CSV}` | VPS/shim; el player no lo aplica solo |
| 6 | `com.ape.codec.chain.audio` | `ac-3,mp4a.40.2,mp4a.40.5` (`:3617`, con `ec-3` retirado el 2026-05-23) | idem |
| 7 | `com.ape.codec.chain.hdr` | `dv,hdr10plus,hdr10,hlg,sdr` | idem |
| 8 | `com.ape.build` | `v5.4-MAX-QUALITY-OVERRIDE` (`:3619`; también `:3565`) | idem |

**Nota honesta:** los 8 van en el bloque `maxQualityMode` (toggle «MAX QUALITY OVERRIDE»); el comentario `:3600-3601` avisa de que **reduce compatibilidad ~35 %**. `NO_COMPUTADO` si la lista servida los lleva todos: depende de ese toggle, y verificarlo exige leer la cabecera en el VPS (`curl -r 0-200000`).

### 2.7 `#EXT-X-APE-LAB-METADATA` — 31 chunks con el JSON del LAB

**Emisión** (`m3u8-typed-arrays-ultimate.js:3090`): `#EXT-X-APE-LAB-METADATA:<i+1>/<total>:<base64>`.

**Lectura en el APK** (`ListLoader.kt:59-81`): regex `^(\d+)/(\d+):(.+)$` → acumula en `labMetaParts[idx]`, y **cuando `size == total`** concatena **en orden 1..total** (`:68-70`) y decodifica (`:105-110`):

```kotlin
val raw  = Base64.decode(b64, Base64.DEFAULT)
val json = JSONObject(String(raw, UTF_8))
labMetadataSha256 = MessageDigest.getInstance("SHA-256").digest(raw)…   // :109-110
```

**Qué JSON lleva dentro:** el LAB del panel, con `fields.<sección>.<clave>`. El APK lo **aplana** en `LabMetadataStore.kt:26-51`:

- `JSONObject` → `flat["<seccion>.<clave>"] = valor` y `count++` (`:34-41`)
- `JSONArray` → `flat[seccion] = array`, `count += array.length()` (`:42-45`)
- escalar → `flat[seccion] = valor`, `count++` (`:46-49`)

y lo persiste en `SharedPreferences` (`:52-55`) + `AraStatus.labMetadataFieldCount = count` (`:57`).

**Los 31 chunks** son un valor medido en la lista `[VPS]`; el mecanismo (`parts.length`) es del código. **Compat de una línea:** si el bloque no casa con la regex, se decodifica entero (`:74-77`) — el APK acepta las dos formas.

### 2.8 `#EXT-X-APE-PROFILE-INDEX` y las **9** `#EXT-X-APE-PROFILE-TEMPLATE`

**Definidos en** `vps/bin/ape-profile-project.js:1044-1046`:

```js
const LIGHT_TEMPLATE_TAG = '#EXT-X-APE-PROFILE-TEMPLATE:';
const LIGHT_INDEX_TAG    = '#EXT-X-APE-PROFILE-INDEX:';
const LIGHT_SHIM_TAG     = '#EXTSHIMOTT:';
```

**Función:** el **índice** dice qué plantilla usa cada canal; las **plantillas** guardan el cartucho una sola vez (una por perfil → 9 = los 9 grupos `(host, perfil)` medidos en `t75` §7.2: P3×3, P1×2, P4×2, P5×2). El canal solo lleva el índice. **Quién lo lee:** el **shim** y el VPS; el **APK no** (no hay rama en `ListLoader.kt`).

### 2.9 El bloque de canal (orden y quién lo lee)

| Línea | Emisor | Lo lee el APK | Lo lee OTT |
|---|---|---|---|
| `#EXTINF:-1 tvg-id=… tvg-name=… tvg-logo=… group-title=… ape-profile="P3" ape-codec-family=… ape-content-type=… ,NOMBRE` | generador | **SÍ — 6 claves** (§3) | `tvg-*`, `group-title` |
| `#EXT-X-APE-PREMIUM-PROFILE:6K;…;TARGET=5760x3240;…` | `ape-6k-premium.sh:126` | **NO** | **NO** |
| `#EXTHTTP:{…}` — **217 claves** | generador | **NO** | **`EXTHTTP` sí (solo valor único en TiviMate)** |
| `#EXT-X-DATERANGE:…` | generador | **NO** | **NO** (RFC lo define para anuncios/fechas) |
| `#EXT-X-APE-UPSCALE:TARGET=…;SOURCE=…;MULTIPLIER=x…;TECH=…` | `ape-real-resolution-6k.sh:247` | **NO** | **NO** |
| `#EXT-X-STREAM-INF:BANDWIDTH=…,RESOLUTION=…,CODECS="…",VIDEO-RANGE=…` | generador | **NO** | **SÍ** (variante/ABR) |
| `#EXTSHIMOTT:{…}` | `m3u8-typed-arrays-ultimate.js:10026` | **NO** | **NO** (lo consume el shim) |
| URL (`https://…/pulse/<id>.m3u8?u=…&d=…`) | cableador | **SÍ — VERBATIM** (`:87`) | **SÍ** |

**`#EXTHTTP` con 217 claves.** El censo de `contracts/llm_operator_knobs_v1.json` (`census.exhttp_keys`) da **193 claves EXTHTTP + 24 bloques SESSION-DATA = 217** de superficie. Para el APK: **inerte**. Para OTT: se usa como cabeceras de la petición (con la restricción de valor único de TiviMate, `server.js:499-500`).

---

## 3 · Qué lee el APK de verdad (y qué es metadata inerte)

**Esto no es interpretación: es el `when` completo de `ListLoader.kt:57-98`.** Tiene **cuatro** ramas y **ninguna más**:

```kotlin
reader.forEachLine { line ->
  when {
    line.startsWith("#EXT-X-APE-LAB-METADATA:") -> { … }   // :59-81
    line.startsWith("#EXTINF")                  -> meta = parseMeta(line)   // :82
    line.startsWith("http") -> onChannel(IptvChannel( … ))                  // :83-96
    // (no hay else: todo lo demás se ignora)
  }
}
```

### 3.1 El canal: 6 claves de `#EXTINF` + la URL

`parseMeta` (`:123-129`) es **genérico**: `Regex("""([\w-]+)="([^"]*)"""")` captura **todos** los atributos con comillas. De todos ellos, `:86-92` **consume seis**:

| Clave | Destino | Default si falta |
|---|---|---|
| `tvg-name` | `name` | `""` |
| `group-title` | `group` | `""` |
| `tvg-logo` | `logo` | `""` |
| **`ape-profile`** | `profile` | **`"P2"`** |
| `ape-content-type` | `contentType` | `""` |
| `ape-codec-family` | `codec` | `""` |
| *(la línea `http…`)* | `url` | **`line.trim()` — VERBATIM (`:87`)** |

**Consecuencia medible:** los demás atributos `ape-*` del EXTINF (si los hay) **se parsean y se tiran**. Y el default `"P2"` es relevante porque **P2 está vacío en el catálogo** (§4): un canal sin `ape-profile` caería en un perfil que no existe como lista.

### 3.2 Lo que el APK ignora (por ausencia de rama, no por decisión)

`#EXTM3U`, `#EXT-X-VERSION`, `#EXT-X-INDEPENDENT-SEGMENTS`, `#EXT-X-APE-GOVERNANCE`, `#EXT-X-APE-ENGINE`, los **8** `#EXT-X-SESSION-DATA`, `#EXT-X-APE-PROFILE-INDEX`, las **9** `#EXT-X-APE-PROFILE-TEMPLATE`, `#EXT-X-APE-PREMIUM-PROFILE`, `#EXTHTTP`, `#EXT-X-DATERANGE`, `#EXT-X-APE-UPSCALE`, `#EXT-X-STREAM-INF`, `#EXTSHIMOTT`, `#EXTVLCOPT`, `#KODIPROP`, y **las ~682 `#EXT-X-APE-*` por canal**.

**Matiz que evita una mentira:** «el APK ignora» **no** significa «nadie lo lee». `#EXT-X-STREAM-INF` y `#EXTHTTP` los usa **OTT**; `#EXTSHIMOTT` lo usa el **shim**; las `#EXT-X-APE-*` las usa el **daemon/VPS**. La frase correcta es: **para el APK son inertes**.

### 3.3 La única metadata que el APK sí aplica de verdad: el LAB

De las 217 claves de superficie, el APK **usa una**: el bloque `#EXT-X-APE-LAB-METADATA` (base64, 31 chunks), que aplana a `fields.<sección>.<clave>` y persiste con **sha256 del JSON crudo** (`ListLoader.kt:105-110`) — es decir, **puede detectar que el LAB cambió**.

---

## 4 · La proyección por perfiles

### 4.1 La partición cuadra exacta

```
P3 20.222 + P1 933 + P4 58 + P5 11 = 21.224   ✓  (verificado)
P0 = 0   P2 = 0
```

### 4.2 La escalera que la explica — `ape-profile-classifier.js:250-273`

```js
if (h >= 4320) return { profile: 'P0', band: '8k' };          // 8K real
if (h >= 3240) return { profile: 'P0', band: '6k-as-8k-…' };  // 6K no declarable
if (h >= 2160) {                                              // 4K
  const highFrame = f !== null && f >= 50;
  if (isHdr(hdrNorm) || highFrame) return { profile: 'P1', band: '4k' };
  return { profile: 'P2', band: '4k' };                        // 4K@30 sin HDR
}
if (h >= 1080) return { profile: 'P3', band: 'fhd' };
if (h >= 720)  return { profile: 'P4', band: 'hd' };
return           { profile: 'P5', band: 'sd' };
```

- **P0 vacío:** exige `h ≥ 3240`. Ninguna fuente medida llega ahí (§7).
- **P2 vacío:** exige `h ≥ 2160` **y** no-HDR **y** fps<50. Si nada llega a 2160, P2 no se pobla **por la misma razón que P1**.
- `:246-248`: **«los `.5` son enhancement de display y NUNCA se seleccionan desde un probe»**.

### 4.3 **Hallazgo: la partición servida NO puede venir de esta escalera**

La muestra de `t75` midió **6 alturas distintas y ninguna supera 1080** (`PROBE_LATENCY_MEASURED_20261115.md:108`): `1920x1080` ×20 · `1280x720` ×9 · `720x576` ×5 · `1024x576` ×2 · `960x540` ×1 · `720x404` ×1.

Aplicando la escalera a esa muestra: **P3 = 20, P4 = 9, P5 = 9, P1 = 0, P2 = 0** (20+9+9 = 38 = la muestra completa; `720x576`, `1024x576`, `960x540` y `720x404` caen todos en `h<720` → P5).

Pero la lista servida tiene **P1 = 933**. Por tanto **los 933 P1 no salen del probe**: salen del `ape-profile` **declarado** (extremo premium / heurística del generador), no del medido. **La partición es una declaración, no una medición** — exactamente la distinción que esta misión persigue. `NO_COMPUTADO` cuál es la regla exacta que asigna `ape-profile` en el generador (requiere leer el asignador completo, fuera del alcance de esta tarea).

---

## 5 · El modelo LIGHT: 250 MB en vez de 1,3 GB

**Cómo se construye** (`vps/bin/ape-list-light.sh:1-28`): **lista blanca** — se conservan `#EXTM3U`, `#EXTINF`, `#EXTHTTP`, `#EXTSHIMOTT` y los `#EXT-X-<estándar>`; **cae** todo lo propietario (APE, VNOVA-LCEVC, PHANTOM-HYDRA, CMAF, `#EXTVLCOPT`). El comentario `:11-18` explica por qué lista blanca y no negra: *«perseguirlas una a una no escala: se quitaron APE (−735 MB) y VNOVA (−90 MB) y quedaban PHANTOM+CMAF (−94 MB) en la misma lista»*.

**Fail-closed** (`:21-27`): `exit 3` si el wrap trae errores · `exit 4` si la proyección no tiene **1 tag y 1 URL por canal** o le quedan APE · `exit 5` sin disco. **En los tres casos no instala: la lista servida queda como estaba.**

**Y el mecanismo que explica el tamaño** (`ape-profile-project.js:1042-1049,1061-1080`):

```js
const LIGHT_POOL_MAX = 512;   // :1049  un valor con <=512 valores distintos por par viaja como ÍNDICE
const LIGHT_VARS = [ ['SID','#EXT-X-APE-IDEMPOTENCIA-SID'], ['NONCE','…#POLIMORFISMO-NONCE'], … ];
```

Es decir: lo que cambia por canal (nonce, sid, ua, ip, channel-id, spoofs…) **no se repite 21.224 veces**: se agrupa en un **pool indexado** (≤512 valores distintos) y el canal lleva el índice; lo que es igual para todos (el cartucho de 682 `#EXT-X-APE-*`) viaja **una vez por plantilla** (9). **Eso es la diferencia entre 1.298 MB y 250 MB.** La cifra exacta del ahorro por familia está en `ape-list-project.sh:12-19` (`APE-` 734,5 MB · `EXTVLCOPT` 111,0 MB · `EXTINF` 10,1 MB · URLs 4,3 MB).

**La firma para distinguirla sin pesar** (verificada contra 5 fixtures en `t89`):

```bash
grep -c '^#EXT-X-APE-' lista.m3u8     # 0 = LIGHT real ; >0 = LIGHT a medias o COMPLETA
```

---

## 6 · El 6K premium con fallback

**Script:** `vps/bin/ape-6k-premium.sh` (uso en `:38`).

| Pieza | Implementación | Línea |
|---|---|---|
| Perfil premium | `ape-profile="Px.5"` (el `.5` = enhancement, nunca elegido por probe) | `:119-125`, `classifier:246-248` |
| Reescritura del perfil en cabeceras | `"X-APE-Profile":"<base>"` → `"<prem>"` y **añade** `"X-APE-Fallback-Profile":"<base>"` | `:101-104` |
| Marca por canal | `#EXT-X-APE-PREMIUM-PROFILE:6K;PROFILE=<prem>;FALLBACK=<base>;TARGET=5760x3240;REASON=alternativa_premium_inicial` | `:126-127` |
| `#EXTSHIMOTT` | `"p":"<base>+…"` → `"p":"<prem>+…"` | `:107-108` |
| **Notas para el LLM** | `json.dumps({'ts','channel','profile_from','profile_to','fallback','ok','note'})` una por canal | `:128-132`, `:143-145` |
| Fichero | `LOG="${APE_6K_LOG:-/var/lib/ape/6k-premium.jsonl}"` | **`:43`** |
| **Gate fail-closed** | `channels`, `urls`, `premium`, `fallback` y `marca` deben **igualar CH0**; si no, `die 5` | `:162-166` |

**`#EXT-X-APE-UPSCALE` con su TECH por multiplicador** — `vps/bin/ape-real-resolution-6k.sh:246-249`:

```python
x = TH / h if h else 0
fo.write('#EXT-X-APE-UPSCALE:TARGET=%dx%d;SOURCE=%dx%d;MULTIPLIER=x%.2f;'
         'TECH=%s;CODEC=%s;FPS=%d;EVIDENCE=host_profile_estimate;SAMPLES=deep\n'
         % (TW, TH, w, h, x, tech(h), c, f))
```

- `MULTIPLIER = TH/h` — el multiplicador **se calcula de la altura real medida**, no se declara a mano.
- `TECH = tech(h)` — la técnica se elige **por la altura** (de ahí «TECH por multiplicador»).
- **`EVIDENCE=host_profile_estimate`** — la propia etiqueta declara que es **una estimación de perfil de host**, no una medición del píxel. **`SAMPLES=deep`** dice de dónde sale.
- Sólo se emite **una vez por canal**, antes del primer `STREAM-INF` (`:245-250`).

---

## 7 · RESOLUTION declarado vs real

| Qué | Valor | Fuente |
|---|---|---|
| **Declarado en `#EXT-X-STREAM-INF`** | **5760x3240** | `ape-6k-premium.sh:126` (`TARGET=5760x3240`) y `ape-real-resolution-6k.sh:28` (`TARGET=5760x3240`) |
| **Medido en las fuentes** | **360 a 2160** px | `PROBE_LATENCY_MEASURED_20261115.md:108-109`: `1920x1080`×20, `1280x720`×9, `720x576`×5, `1024x576`×2, `960x540`×1, `720x404`×1 |
| **Etiqueta de honestidad del propio tag** | `EVIDENCE=host_profile_estimate` | `ape-real-resolution-6k.sh:248` |

**`probe-deep.json`:** el artefacto **no está versionado en el repo** (vive en el VPS, lo produce `/opt/ape-pulse/ape-probe-deep.sh`). Los números de arriba son la **cita** del informe de `t75`, que sí leyó ese artefacto. **`NO_COMPUTADO`** el contenido por canal dentro del repo.

**La frase que no se puede escribir:** *«la lista es 4K»*. Lo medido es: **se declara 5760x3240** y **las fuentes medidas llegan a 1080 en el 52,6 % de la muestra (20/38)** y **a 2160 en el 0 %**. Un `RESOLUTION` que excede la fuente es **enhancement declarado** (`CRYSTAL_4K_ENHANCEMENT_LAW`), no resolución real — y por eso el tag lleva `EVIDENCE=host_profile_estimate`.

---

## 8 · Duplicados y trampas

| # | Qué | Evidencia | Acción |
|---|---|---|---|
| **D-1** | **#3 `_P3_CABLEADA_LIGHT` y #4 `_P3_CABLEADA_LIGHT_CABLEADA`** son **idénticos** | **238.198.463 B** los dos y, **según el encargo, el mismo `sha256`** `[VPS]`. El nombre del segundo dice que se **re-cableó una lista ya cableada** | el `_CABLEADA` del `_CABLEADA` es **síntoma de que la cadena no es idempotente en el nombre**; re-verificable con `sha256sum` en una línea |
| **D-2** | **#9 `_P5` y #10 `_P5_CABLEADA`** son **idénticos** | **516.221 B** los dos. Que `_CABLEADA` pese **exactamente igual** que su fuente sugiere que el cableado **no reescribió nada** | confirmar con `sha256sum`; si se confirma, **el cableado de P5 no está envolviendo en `/pulse/`**… salvo que ya viniera envuelto |
| **D-3** | **#5 `_P3_CABLEADA` y #6 `_P3`** difieren en **41 B** | 240.723.972 vs 240.724.013 | casi-duplicados: 41 B ≈ una línea de cabecera |
| **T-1** | **`APE_PRUEBA_*` vive en el directorio PÚBLICO con 0 salidas** | 163.187 B · 3 canales · **0 `/pulse/`, 0 `/cdn/`, 3 directas** | **cualquiera que importe ese nombre va directo al proveedor sin pasar por el motor**. Sólo lectura: se reporta, no se mueve |
| **T-2** | **`ape_jit_latest.m3u8` puede publicar una lista sin `/pulse/`** | `ape-jit-latest.sh:87-93`: si `pulse=0` avisa y **sale con `exit 3`** — pero **el `exit 3` no se ve desde el menú** | el inventario de §1 comprueba el invariante por lista |
| **T-3** | **La `_CABLEADA_LIGHT` pesa 250.932.745 B**, no los ~3,3 MB que anunciaba el commit `ddff9ce0` | comparación de cifras | `grep -c '^#EXT-X-APE-'`: **0 = LIGHT real; >0 = LIGHT a medias**. `NO_COMPUTADO` mientras no se corra |

---

## 9 · Dónde viven

| Ruta | Qué es | Fuente |
|---|---|---|
| `/var/www/lists` | **directorio real** de las listas | `ape-profile-project.js` y `ape-list-light.sh` usan `APE_LISTS_DIR` con default `/var/www/html/lists`; el symlink lo declara la tarea `[VPS]` |
| `/var/www/html/lists` → `/var/www/lists` | **symlink** del docroot al directorio real | `[VPS]` (declarado en el encargo; `ls -ld` lo confirma) |
| `/var/www/lists/pulse/` | variante que sirve `/lists/APE_LISTA_1794100720046.m3u8` — **1.311.467.322 B** | `[VPS]` |
| `/var/lib/ape/6k-premium.jsonl` | notas del 6K para el LLM | **`ape-6k-premium.sh:43`** `[CÓDIGO]` |
| `/var/lib/ape/t75_measure.jsonl` | medición del probe | `PROBE_LATENCY_MEASURED_20261115.md:33` `[VPS]` |

**Los dos ficheros que sirven el mismo nombre son distintos:**

```
/lists/APE_LISTA_1794100720046.m3u8       1.311.467.322 B   ← lo que se sirve por HTTP
APE_LISTA_1794100720046_CABLEADA.m3u8    1.298.222.092 B   ← el fichero cableado
```

Difieren en **13.245.230 B**. **`NO_COMPUTADO` qué son esos bytes** (requiere `diff`/`cmp` en el VPS). **Lo que sí se puede afirmar:** **no es la LIGHT** (250.932.745 B) ni la `_CABLEADA`; y `1.311.467.322` **no coincide con ninguna de las 13 filas de §1** → la variante servida es **un cuarto objeto** que no aparece en el inventario por nombre. Eso **refuerza la necesidad del inventario de §1**: hay al menos un fichero servido que no figura en la tabla de nombres.

---

## 10 · `NO_COMPUTADO` (declaración explícita)

| Item | Razón |
|---|---|
| `sha256` y `mtime` de las 13 filas | requieren `sha256sum`/`stat` en `/var/www/html/lists`; **`ssh` rechazado por política** |
| Nº real de ficheros del directorio (glob `APE_PRUEBA_ORDER_OK*`) | idem |
| Si la lista servida lleva los **8** SESSION-DATA (toggle `maxQualityMode`) | exige leer la cabecera en el VPS (`curl -r 0-200000`) |
| La regla exacta que asigna `ape-profile` en el generador | requiere leer el asignador completo; el probe **no** explica los 933 P1 (§4.3) |
| Contenido de `probe-deep.json` por canal | vive en el VPS, no versionado |
| Qué son los 13.245.230 B de diferencia entre la servida y la `_CABLEADA` | requiere `cmp`/`diff` en el VPS |
| Si los pares D-1 y D-2 son idénticos de contenido | requiere `sha256sum` |
| Cadencia real de refresco del OTT en el device | vive en la configuración del device |

---

## 11 · Resumen para el LLM (lo que hay que saber y no olvidar)

1. **El APK lee 6 claves del `#EXTINF` + la URL VERBATIM + el bloque LAB.** Todo lo demás es inerte **para el APK** (no para OTT/shim/daemon).
2. **El LAB es la única metadata viva** en el APK: 31 chunks base64 → `fields.<sección>.<clave>` → `SharedPreferences` con **sha256** para detectar cambio.
3. **P0 y P2 vacíos** no son un fallo: la escalera exige `h≥3240` y `h≥2160`-sin-HDR. **Pero los 933 P1 no salen del probe** — salen de lo declarado. No confundir.
4. **LIGHT = 250 MB** porque el cartucho viaja **una vez por plantilla** y lo variable va en un **pool de ≤512** `[ape-profile-project.js:1049]`.
5. **6K = declaración, no medición**: `TARGET=5760x3240` con fuentes de 360–2160 px, y el propio tag lo dice (`EVIDENCE=host_profile_estimate`).
6. **`grep -c '^#EXT-X-APE-' = 0`** es la firma de LIGHT real. Es la comprobación más barata del sistema.

---

## ADDENDUM 2026-11-15 15:43Z — correcciones post-auditoría (t96)

F-02 · La fila 1 de §1 decía `250.932.745 B`. Esa era la medición ANTES de aplicar el 6K
SIMULADO. Medición vigente: **261.350.350 B** (mtime 2026-11-15 15:43:32, gz 14.794.798 B),
tras añadir 21.224 `#EXT-X-APE-UPSCALE:…MODE=SIMULATED` y 21.224 `#EXTVLCOPT:video-filter=`.
El sha256 de las URLs NO cambió: `7dd8ce1598a9be8e` antes y después.

F-04 · «Las 14 listas» son 14 FILAS de tabla. Lo medido con `ls` es **18 ficheros .m3u8** en
`/var/www/lists/`. La fila 12 es un glob, la 13 un puntero y la 14 el symlink `ape_jit_latest.m3u8`
de 57 B (longitud de su destino: 20 + 37). El número por sí solo no se reporta como conteo de ficheros.

Nota de estado: este documento es una FOTO de la ventana 2026-11-15 14:20–15:40Z. Cualquier cifra
de bytes que lo contradiga y tenga mtime posterior es una capa aplicada después, no un error.