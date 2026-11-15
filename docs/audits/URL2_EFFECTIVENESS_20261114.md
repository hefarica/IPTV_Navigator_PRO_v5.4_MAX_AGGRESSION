# URL2 — qué lee de verdad OTT Navigator de las directivas por canal

**Autor:** canary-auditor (team `canary-jit-20261111`, task `t57`) · **Fecha:** 2026-11-14 · **Modo:** sólo lectura sobre una copia; **la lista del operador no se ha tocado** y no se ha consumido ningún slot.

## Veredicto en una línea

**De 1.053,1 líneas por canal, OTT Navigator lee 6 (0,57 %). Las otras 1.047,1 (99,43 %) son inertes para ese reproductor: el operador descarga 1,31 GB para usar ~184 MB.** Y **la fluidez NO se arregla por los `#EXTVLCOPT` de buffer**: OTT no parsea `network-caching` ni `adaptive-*`; de las 137 líneas `#EXTVLCOPT` por canal, sólo **2** tienen efecto en OTT (`http-user-agent`, `http-referrer`).

---

## 0. Base de evidencia: el parser de OTT **no se puede leer aquí**

| Intento | Resultado |
|---|---|
| APK `studio.scillarium.ottnavigator` en el workspace | **no existe**: barrido recursivo de `*.apk` (20 ficheros) + nombres `ott*navigator`/`scillarium` → **0 APK**; sólo dos `.md` de configuración (`frontend/OTT_NAVIGATOR_SETUP.md`, 5.368 B, sin nada del parser) |
| Decompilar el parser | **`NO_COMPUTADO`** — sin APK no hay DEX que leer; el APK auditado en este repo (`com.ape.crystalagent`) **no es el reproductor** |
| Comportamiento en un device | **`NO_COMPUTADO`** — sin device ni sesión de reproducción (y reproducir consumiría el slot, prohibido por el encargo) |

Por tanto **cada veredicto lleva su clase de evidencia**, y no las mezclo:

| Clase | Qué significa |
|---|---|
| **`MEDIDO`** | lo conté yo sobre la lista real en esta corrida (con `n` y `sha256`) |
| **`VENDOR`** | el changelog oficial de OTT Navigator (fuente secundaria, citada en la skill `ape-image-pipeline-truth` §11: *«Embebe VLC 3.6.4 · Parsea `#EXTVLCOPT` **sólo** para user-agent y http-referrer · Parsea `#KODIPROP` (`inputstream.adaptive.*`) y `#EXTATTRFROMURL` · **nunca menciona video filters**»*) |
| **`DOCTRINA`** | tabla de consumidores de la skill `ape-url2-metadata-cartridge-arrays` (OTT honra STREAM-INF + VIDEO-RANGE + EXTHTTP; EXTVLCOPT→VLC; KODIPROP→Kodi; `EXT-X-APE`/`EXTATTRFROMURL`→daemon) |

**Un veredicto `VENDOR`/`DOCTRINA` no es una medición.** Va marcado como tal en cada fila.

---

## 1. Lo medido (n = 1.086 bloques completos)

**Artefacto medido:** `scratch/APE_LISTA_HARNESS.m3u8` — **1.311.382.485 B (1,311 GB)**, `sha256 199de252b6fc527dd9dddee9abcf22df7c4eb4a4d5e5fecf40f8db97e0a608a2`. Lectura **acotada a 64 MB** desde el inicio; se parsearon **1.086 bloques completos** (cabecera + 1.086 canales).

| Medición | Valor | Nota |
|---|---:|---|
| Cabecera (hasta el primer `#EXTINF`) | **92.118 B (90,0 KB)** | el encargo dice 92.059 B sobre otro fichero |
| **Líneas por bloque** | **1.053,1** | incluye 2,00 líneas vacías |
| **Bytes por bloque** | **61.674** | |
| Familias **distintas** por bloque | **750** | cola larguísima de `#EXT-X-APE-*` con 1-2 apariciones |
| Perfiles presentes en la muestra | **P3 (1.045) · P1 (41)** | la cartilla es idéntica en ambos: 1.053,2 vs 1.050,5 líneas |

**Validación de la extrapolación:** 21.224 canales × 61.674 B = **1.308.971.517 B (1,309 GB)** frente a los **1.311.382.485 B** reales → **desvío −0,18 %**. La muestra es representativa.

---

## 2. Tabla familia → veredicto → evidencia

| Familia | Líneas/canal (`MEDIDO`) | Veredicto **para OTT** | Evidencia |
|---|---:|---|---|
| `#EXTINF` | 1,0 | **APPLIED** | lo consume cualquier parser M3U; es el bloque del canal (`DOCTRINA`) |
| **`#EXTHTTP` (JSON de headers)** | **1,0** | **APPLIED** | `VENDOR`+`DOCTRINA`: OTT manda esos headers al proveedor. Prueba **de comportamiento** en la propia lista: el JSON lleva `"User-Agent":"Mozilla/5.0 (Web0S; …)"` y `"Referer"` (medido: **1,00/bloque cada uno**), y el proveedor responde **302** con UA real frente a **461** con el UA por defecto de curl (hecho medido del encargo) |
| **`#EXT-X-STREAM-INF`** | **1,0** | **APPLIED** | `DOCTRINA`: ExoPlayer/OTT lo usa para seleccionar variante. Lleva `VIDEO-RANGE=` en **1,00/bloque** (medido) |
| URL del canal | 1,0 | **APPLIED** | es la petición en sí (1,00/bloque, medido) |
| **`#EXTVLCOPT` — 2 claves** (`http-user-agent`, `http-referrer`) | **2,0** | **APPLIED** | `VENDOR`: OTT parsea EXTVLCOPT **sólo** para esas dos |
| **`#EXTVLCOPT` — las otras 134 claves** | **135,0** | **IGNORED** | `VENDOR`: OTT no las lee. (§3 las desglosa) |
| **`#KODIPROP`** | **109,0** | **IGNORED** | 106 claves **todas** `inputstream.adaptive.*` (medido). `DOCTRINA`: son de **Kodi/InputStream-Adaptive**. `VENDOR` coincide: OTT parsea KODIPROP… pero su motor es ExoPlayer/VLC, no ISA; **no hay evidencia de que aplique `inputstream.adaptive.*`** → lo declaro **`DECLARED`**, no aplicado |
| **`#EXTATTRFROMURL`** | **54,0** | **IGNORED** | 54 claves, todas `X-APE-*` (medido); `DOCTRINA`: las lee el **daemon** on-device, no OTT |
| **`#EXT-X-APE-*`** | **682,2** | **IGNORED** | namespace propietario; RFC 8216 §4.2: el player ignora tags desconocidos. `DOCTRINA`: consumidor = daemon/cliente consciente |
| `#EXT-X-CMAF*` | 26,0 | **IGNORED** | idem: no es HLS estándar que ExoPlayer interprete |
| Otras (`#EXT-X-VERSION`, ...) | ~41 | mixto | `#EXT-X-VERSION` sí lo lee cualquier parser; el resto, no |
| **TOTAL** | **1.053,1** | **6 APPLIED / 1.047,1 IGNORED o DECLARED** | |

### 2.1 Honor al matiz: `DECLARED` no es lo mismo que inerte en el universo

Estas 1.047 líneas **no son basura**: son funcionales para **otros** consumidores (VLC las 135 EXTVLCOPT reales; Kodi las 109 KODIPROP; el daemon las 682 APE + 54 EXTATTRFROMURL + 26 CMAF). La regla del repo (`iptv-omega-no-delete`) prohíbe borrarlas «por duplicación». **Lo que digo es más estrecho y verificable: para el reproductor que el operador usa (OTT Navigator), no hacen nada.**

---

## 3. El punto que más puede mejorar la fluidez: **los EXTVLCOPT de buffer NO**

Desglose medido de las **137 líneas `#EXTVLCOPT` por canal** (136 claves distintas):

| Grupo | Claves | Líneas/canal | ¿Efecto en OTT? |
|---|---:|---:|---|
| **Las 2 que OTT parsea** | `http-user-agent`, `http-referrer` | **2,0** | **SÍ** (`VENDOR`) |
| Red/buffer VLC | 60 claves: `network-caching`, `network-timeout`, `network-reconnect*` (5), `clock-synchro`, `live-caching`, `sout-keep`, `http-forward-cookies`, `http-reconnect`, … | **60,0** | **NO** |
| **`adaptive-*`** | **44 claves**, incluidas **~24 `adaptive-reload-use-*`**, `adaptive-maxbuffer`, `adaptive-livedelay`, `adaptive-maxwidth/maxheight`, `adaptive-bw-factor`, `adaptive-throughput-t1/t2` | **44,0** | **NO** |
| Resto (códec, audio, subtitle, `ts-*`, …) | ~30 | **31,0** | **NO** |

**Respuesta directa al punto 3:** `network-caching` es **1,00 línea por canal** y **OTT no la lee**. `adaptive-reload-*` son **~24 claves por canal** y **OTT no las lee**. **La fluidez vía URL2 no se arregla por ahí.**

Y hay un segundo piso: según la auditoría de VLC 3.0.24 que documenta la skill `ape-image-pipeline-truth` §6, **de 138 nombres `#EXTVLCOPT` distintos en la lista, 80 no existen en ningún binario de VLC**, y la familia `adaptive-*` (36 claves) es inexistente. **En VLC 3.0.24 tampoco harían nada.** Fuente: `tools/ape-image-recipes/VLC_OPT_AUDIT.md`.

---

## 4. Las 3 + 3, con números

### 4.1 Las 3 que SÍ pueden mover algo que OTT lee

| # | Directiva | Por qué puede mejorar | Coste | Estado |
|---|---|---|---:|---|
| **1** | **`#EXTHTTP` con `User-Agent`/`Referer` correctos** | es el **único** lever de metadata con efecto **medido** sobre si el proveedor responde: **302 con UA real vs 461 con el UA por defecto de curl**. Un 461 es un no-servicio → no hay imagen ni fluidez | **1 línea** (~1 KB) | **ya presente** (1,00/bloque, con UA Web0S real) |
| **2** | **`#EXT-X-STREAM-INF` con `BANDWIDTH` honesto** | ExoPlayer decide variante y arranque con ese número; un `BANDWIDTH` inflado hace que el player pida más de lo que la red aguanta → **stalls**. Es el único eje de fluidez **dentro del manifest** que el player sí lee | **1 línea** | **presente** (1,00/bloque) — **falta verificar que el valor sea real**, no declarado |
| **3** | **`#EXT-X-STREAM-INF` con `CODECS`/`RESOLUTION` coherentes (GOLDEN RULE + Ley Cardinal 1)** | un `CODECS` que el decoder no soporta, o un nivel < resolución, produce **freeze** (incidente 2026-06-08). Coherencia = no romper | **1 línea** | **presente**; la coherencia hay que auditarla por canal, no se asume |

> **Nota honesta:** `VIDEO-RANGE=PQ` (1,00/bloque) mejora **imagen** (modo HDR del TV), **no fluidez**. No lo cuento como palanca de fluidez.

### 4.2 Las 3 que sólo añaden peso (inertes para OTT)

| # | Familia | Líneas/canal | **Líneas en la lista (21.224 canales)** | Bytes/canal | Peso total |
|---|---|---:|---:|---:|---:|
| **1** | **`#KODIPROP`** (`inputstream.adaptive.*`, 106 claves) | **109,0** | **2.313.416** | **6.623** | **140,6 MB** |
| **2** | **`#EXT-X-APE-*`** (682,1) + **`#EXT-X-CMAF*`** (26) | **708,1** | **15.028.600** | **36.553** | **775,8 MB** |
| **3** | **`#EXTVLCOPT` inertes en OTT: `adaptive-*` (44) + red/buffer (60) + resto (31)** | **135,0** | **2.865.240** | **5.033** | **106,8 MB** |

> **El dato que sorprende y conviene tener a mano:** la línea más pesada **por unidad** no es una familia grande — es **`#EXTHTTP`**: **1 línea por canal pero 7.410 B** (lleva todo el bloque `X-APE-*` como headers JSON) → **157,3 MB en la lista (12,0 %)**. Y es una línea que **OTT SÍ usa**: no se puede quitar, pero se puede **adelgazar** (hoy pesa 18× más que la `#EXT-X-STREAM-INF`, que es la que decide variante). Es la única optimización de peso compatible con «no perder nada para OTT».
**Suma de las tres: 952,2 líneas/canal → 20.209.493 líneas de 22.350.865 (90,4 %) · 48.209 B/canal → 1.023,2 MB de 1.309,0 MB (78,2 % del manifest).**

---

## 5. Recuento de líneas que se podrían quitar «sin perder nada» — **con el alcance bien puesto**

| Alcance | Líneas/canal | Líneas en la lista | % | Bytes | ¿Se pierde algo? |
|---|---:|---:|---:|---:|---|
| **Sin perder nada PARA OTT** | **1.047,1** | **22.223.521** | **99,43 %** | **1,125 GB (85,96 %)** | **No para OTT.** Sí para VLC/Kodi/daemon |
| **Sin perder nada para OTT *ni* para VLC 3.0.24** (las `adaptive-*` no existen en VLC) | **44,0** | **933.856** | 4,18 % | ~53 MB | **Nada comprobable** (pero rompe apps VLC futuras que sí las implementen) |
| **Sin perder nada para NINGÚN consumidor conocido** | **0,0** | **0** | 0 % | 0 | Cualquier borrado quita capacidad a VLC, Kodi o al daemon |

**Respuesta al operador, sin adornos:**

- Si el objetivo es **que OTT cargue antes**: el manifest baja de **1,311 GB a ~184 MB** (**−85,96 %**) quitando lo que OTT ignora. **Pero eso apaga el cartucho para VLC, Kodi y el daemon**, que es justo lo que el encargo quiere conservar.
- Si el objetivo es **conservar la doctrina** (un cartucho, todos los consumidores): **no se puede quitar ni una línea sin perder algo**, y el precio de tenerlo todo en el mismo fichero es que **OTT descargue 1,31 GB para leer 184 MB**.
- **Palanca real, si se quiere ambas cosas:** servir **dos variantes del catálogo** (una completa para VLC/Kodi/daemon y una «OTT-lite» con las 6 líneas que OTT lee + `#EXT-X-STREAM-INF`). Eso es **decisión de producto**, no de este informe, y no lo he implementado.

---

## 6. Discrepancias con las cifras del encargo (declaradas, no resueltas)

| Dato | Encargo (`APE_LISTA_1794100720046`) | **Medido por mí** (`APE_LISTA_HARNESS`, `199de252…`) | Δ |
|---|---:|---:|---|
| Líneas por bloque | 949 | **1.053,1** | **+10,97 %** |
| `#KODIPROP` /bloque | 201 | **109,0** | −45,8 % |
| `#EXTVLCOPT` /bloque | 137 | **137,0** | **coincide exacto** |
| `#EXTATTRFROMURL` /bloque | 67 | **54,0** | −19,4 % |
| Total líneas lista | ~22,4 M | **22.350.865** | coincide |

`#EXTVLCOPT` coincide al decimal y el total también, así que **probablemente es la misma familia de lista con otra generación**. La diferencia de `#KODIPROP` (201 vs 109) es la que más pesa: puede ser una **ventana de 78 KB que cruzaba bloques** o una versión con más claves. **No lo resuelvo aquí**: mis cifras son de 1.086 bloques completos con `n` y hash, y el veredicto (OTT lee 6 líneas) **no depende** de esa diferencia.

---

## 7. `NO_COMPUTADO`

| Afirmación | Estado | Razón |
|---|---|---|
| Qué claves lee el **parser** de OTT, línea por línea | **`NO_COMPUTADO`** | no hay APK de `studio.scillarium.ottnavigator` en el workspace |
| Si OTT **aplica** `#KODIPROP inputstream.adaptive.*` | **`NO_COMPUTADO`** / tratado como `DECLARED` | el changelog dice que parsea KODIPROP; **no** dice que aplique el namespace de Kodi. Sin APK no se puede cerrar |
| Si OTT **ignora** `#EXT-X-APE-*` activamente o sólo los salta | **`NO_COMPUTADO`** | RFC 8216 §4.2 dice que se saltan; el comportamiento real del binario no se ha medido |
| Tiempo de carga real del manifest en el device | **`NO_COMPUTADO`** | sin device (y no se consume slot) |
| Que `BANDWIDTH` de cada `#EXT-X-STREAM-INF` sea honesto | **`NO_COMPUTADO`** | exige medir el bitrate real por canal |
| Que la muestra de 64 MB represente el 100 % del fichero | **parcialmente validado** | extrapolación a 1,309 GB vs 1,311 GB real = **−0,18 %**; el **resto** de bloques no se ha parseado |

---

## 8. Lo que este documento NO afirma

1. **No afirma haber leído el parser de OTT.** No hay APK. Los veredictos `VENDOR`/`DOCTRINA` van marcados y **no** son mediciones mías.
2. **No propone borrar las 1.047 líneas.** Explica el coste de cada alcance (§5) y deja la decisión al operador.
3. **No toca la lista del operador**: se midió sobre `scratch/APE_LISTA_HARNESS.m3u8` en **lectura acotada (64 MB)**, sin escribir nada; y `sha256` del fichero medido queda registrado.
4. **No ha consumido el slot**: cero peticiones de reproducción, cero canales.
5. **No dice que la metadata no sirva**: dice que **para OTT**, la metadata que sirve son **6 líneas**, y que las otras **1.047** sirven a otros consumidores. Esa es la distinción que el encargo pedía y que este repo ya pagó por confundir.
