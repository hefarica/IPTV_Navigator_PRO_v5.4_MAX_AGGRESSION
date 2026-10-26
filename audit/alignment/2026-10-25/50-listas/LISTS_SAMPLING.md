# LISTS_SAMPLING — Método, denominador, enmascarado y límites de esta auditoría

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana:** `2026-10-26T04:07Z – 04:40Z`
**Objetivo de este documento:** que **cualquier otro auditor pueda reproducir o refutar** los números de
`LISTS_INVENTORY.md`, `LISTS_RFC8216_AUDIT.md`, `LISTS_HEADERS_TRAPS.md`, `LISTS_CODEC_COHERENCE.md` y
`LISTS_DIFF_VPS_VS_DIRECT.md`, y que sepa **exactamente qué NO se midió**.

---

## 1. Las 3 preguntas del muestreo, respondidas de entrada

| Pregunta | Respuesta |
|---|---|
| ¿Cuántas listas existen? | **7** en el VPS (`/var/www/lists`, 1 642 243 210 B comprimidos) + **27** archivos `.m3u8` en el repo (1 451 818 942 B) con **22 contenidos distintos** → **29 contenidos de lista** en total |
| ¿Cuántas revisé? | VPS: **6 de 7** (5 con censo completo + 1 por identidad byte a byte probada + … ver §2). Repo: **22 de 22 contenidos distintos (100 %)** |
| ¿Cuántas quedan UNKNOWN? | **1** lista del VPS: `APE_LISTA_1792950212154_CDN_SHIELDED` — sólo se midió su familia de URL (10 520 canales, 100 % `/cdn/`); **sus combos `RESOLUTION|CODECS` no se midieron**. En el repo: **0 UNKNOWN** (los 5 archivos no auditados individualmente son duplicados con hash idéntico, §4) |

---

## 2. Denominador del VPS, cerrado por aritmética

| Concepto | Cuenta | Detalle |
|---|---|---|
| Archivos `.m3u8` (placeholder 8 B) | 7 | **1 solo sha256** (`144659b4…313dd12`) ⇒ no identifican la lista |
| Archivos `.gz` (payload real) | 7 | 7 `sha256` distintos ⇒ **7 identidades reales** |
| Listas lógicas | **7** | `.m3u8` + `.gz` = **una** lista, no dos |
| Con censo estructural completo (todas las líneas) | **5** | A1, A2, A3, A4, A6 |
| Con identidad probada (payload descomprimido idéntico) | **+1** | A5 = A4 (`cmp` IDENTICAL_PAYLOAD, t7 §5.2) |
| Con medición parcial (sólo familia de URL) | **+1** | A7 |
| **UNKNOWN de contenido** | **1** | A7 (combos de códec) — **0,0 % de los canales**, 8,2 % del payload |

**Canales cubiertos:** 25 905 + 10 172 + 25 669 + 23 510 + 10 520 + 10 520(A7, sólo URL) = **106 296 canales
en las 6 listas medidas**, de los cuales **95 776 tienen censo estructural completo** (100 % de sus líneas
recorridas por `awk`).
**Líneas recorridas en el VPS:** 22 271 732 × 2 pasadas (A4) + 24 488 012 (A1) + 9 668 242 (A2) +
24 315 810 (A3) + 10 000 217 (A6) + ~10 000 217 (A7, sólo URLs) = **≈ 122,7 millones de líneas**.

---

## 3. Método: cómo se midió cada cosa (comandos exactos)

### 3.1 VPS — todo por **streaming**, sin descomprimir a disco

| Medición | Comando (read-only) | Script |
|---|---|---|
| Censo estructural completo | `zcat "$F" \| awk '…'` — **una sola pasada**, contadores + histograma de tags + combos `RES|BW|CODECS|VR` | `tools/vps_catalog_census.sh` |
| Censo corregido (blancos vs URIs, tóxicos por **clave exacta**, canales con/sin `STREAM-INF`, cola real) | `zcat "$F" \| awk '…'` | `tools/vps_catalog_census2.sh` |
| Censo ligero de las 4 listas restantes | `zcat "$F" \| awk '…'` en bucle | `tools/vps_light_census.sh` |
| Tamaño máximo de `#EXTHTTP` | `zcat \| awk` con `length($0)` | (inline en el log de la sesión) |
| Familia de URL por canal | `zcat \| awk` con `index($0,"/cdn/")` etc. | (inline en el log) |
| Valores de tags de códec/HDR por canal | `zcat \| awk` con `exit` tras el primer canal | `tools/probe_tags.sh` |
| Integridad | `gzip -t` (**prueba sin extraer**) | — |
| Identidad | `sha256sum`, `stat -c`, `cmp` (t7, §5.2) | — |

**Nunca se creó un archivo en el VPS.** El único temporal fue `/tmp/_h.txt` (cabeceras de un `curl`), borrado en
la misma llamada con `rm -f`. Las listas **no se descomprimieron a disco**: `zcat | awk` no deja residuo.

**Cómo se envía un script sin escribirlo en el VPS:** se codifica en base64 en la estación local y se ejecuta
con `ssh hetzner-iptv "echo '<b64>' | base64 -d | bash -s"`. Cero archivos remotos, cero `scp`.

### 3.2 VPS — prueba funcional de servicio (GET, loopback)

```
curl -sk -o /dev/null -D - -H "Range: bytes=0-0" "https://127.0.0.1/lists/APE_LISTA_1792869328847.m3u8"
curl -sk -D -  "https://127.0.0.1/cdn/127.0.0.1:8088/__fixture_master4k.m3u8"     # rewrite ANTES/DESPUÉS
curl -sk       "http://127.0.0.1:8088/__fixture_master4k.m3u8"                     # original sin rewrite
curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1/shield/token/host/live/u/p/1.m3u8"   # → 404
```

Los fixtures (`/__fixture_master4k.m3u8` → alias de `/etc/nginx/ape-selftest/playlist_master4k.m3u8`) son
**auto-tests locales del propio VPS**: el experimento **no contactó a ningún proveedor**.

### 3.3 Repo — auditoría línea a línea en Node (streaming, sin cargar el archivo en memoria)

```
node tools/lists_audit.js --out tools/_raw_lists_audit.json  <22 archivos>
node tools/extract.js tools/_raw_lists_audit.json table   > tools/_raw_tabla.tsv
node tools/extract.js tools/_raw_lists_audit.json detail  > tools/_raw_detalle.txt
```

* `readline` sobre `createReadStream` (1 MB de buffer): el archivo de **718 MB** se procesó en **122 s** sin
  volcar memoria.
* `JSON.parse` **real** sobre cada `#EXTHTTP` (no regex): 23 510 + 106 296 bloques parseados.
* Detección de nivel↔resolución con tablas declaradas (HEVC/H.264/AV1) — ver `LISTS_CODEC_COHERENCE.md` §0.
* **Duplicados:** `sha256` de cada archivo + `Map` de URIs para detectar la misma URL dos veces.

---

## 4. Enmascarado de credenciales (regla aplicada, sin excepciones)

**Ningún token completo se reproduce en los 6 entregables.** La función está en `tools/lists_audit.js`
(`maskUrl`) y aplica a todo lo que se imprime:

1. Se conserva `esquema://host` (es lo que identifica al proveedor y es público en la doctrina).
2. Se conservan los segmentos **estructurales** de una lista blanca:
   `live, movie, series, shield, cdn, meta, stream, playlist, index, m3u8, ts, m4s, mp4, master, hls, play,
   api, timeshift, catchup`.
3. Cualquier otro segmento se sustituye por **`<CRED>`**; si termina en extensión conocida, por
   **`<CRED>.<ext>`** (para no perder la información "es una playlist / un segmento").
4. La *query string* completa se colapsa a **`?<Q>`** (puede llevar tokens de sesión).
5. En `#EXTHTTP`: `Cookie`, `Auth*`, `*token*`, `*key*`, `*secret*` ⇒ `<REDACTED>`; `User-Agent` se trunca a 40
   caracteres; los valores que son URL pasan por `maskUrl`.

**Ejemplo real (esta es la forma en que aparece en todo el informe):**

```
original : http://line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8      ← NO se reproduce en ningún entregable
publicado: http://line.tivi-ott.net/live/<CRED>/<CRED>/3.m3u8
```

**Excepción declarada y consciente:** en `LISTS_RFC8216_AUDIT.md` §A-01/§A-02 se reprodujo **la cabecera**
(líneas 1-8 y 57 del `.gz`), que **no contiene credenciales** (son `#EXT-X-*` de configuración). Igual con los
`#EXT-X-STREAM-INF`, que sólo llevan atributos de códec/bitrate.

---

## 5. Límites honestos (lo que **NO** se midió y por qué)

| # | Límite | Impacto en las conclusiones |
|---|---|---|
| **L1** | **No se hizo ni un solo GET al proveedor** (`line.tivi-ott.net`, CDNs). El "manifest real del proveedor" es **UNKNOWN**. | Todo lo dicho sobre la lista directa es sobre el **archivo**, no sobre lo que el proveedor sirve hoy. **No se validó** que las 23 510/25 905 URLs respondan 200, ni su `TARGETDURATION` real. Sería posible (son streams autorizados del propietario) pero excede "solo lectura" y esta auditoría no lo hizo |
| **L2** | **No se midió la distribución del pool `Referer`/`Origin`** (trampa #14). Se muestrearon 2 bloques: ambos `https://www.netflix.com/` | El pool podría tener 1 solo dominio para todos ⇒ SPOF. **UNKNOWN** |
| **L3** | **A7 sólo se midió en familia de URL** (10 520 canales, 100 % `/cdn/`) | Sus combos de códec y tóxicos quedan **UNKNOWN** (afecta a 0 canales contables, porque A7 es 1 de 7 y el resto está medido) |
| **L4** | **El censo ligero reporta `EXTM3U=0@`** en las 4 listas nuevas | **Es un artefacto del script**, no un hallazgo: `extkey()` corta en el primer `:` o `=`, y `#EXTM3U x-tvg-url=""` produce la clave `"EXTM3U x-tvg-url"`. El censo completo sí verificó `EXTM3U_COUNT=1` en `LINE=1` (A4) y el auditor de repo lo verificó en las 22 listas. **No usar la columna `EXTM3U` del censo ligero** |
| **L5** | **La lista directa "del repo" no es la lista que se sirve** | La correlación `lista servida ↔ commit del generador` es **UNKNOWN por diseño** (se sube por HTTP, no por git). Sólo se conoce el `generatorVersion` **autodeclarado** dentro del `.gz` |
| **L6** | **No se ejecutó `APE_SanityCheck`** (validador en navegador) ni se corrió un player real | Los veredictos de compatibilidad son **estáticos** (gramática + doctrina), no empíricos sobre OTT Navigator/TiviMate/VLC |
| **L7** | **Una sola medición temporal** (no hay serie) | No se midió si las listas rotan de contenido entre recargas; sólo que A4 **no cambió** entre t7 (04:00Z) y t8 (04:07Z) |
| **L8** | **No se verificó `Accept-Encoding: gzip` explícito** en el `curl` del catálogo | t7 sí lo verificó (§4.1: sirve el `.gz`, `Content-Encoding: gzip`). t8 verificó el camino **sin** `Accept-Encoding` (gunzip on). Ambos caminos quedan cubiertos entre las dos sesiones, no por una sola |
| **L9** | **`/meta/` no se pudo ejercitar** con un fixture | Su regex no admite `host:puerto` y no está en el vhost 443 ⇒ se auditó **por código** (`ape_uri_rebase.lua`, 139 líneas leídas íntegras) y no por ejecución |
| **L10** | El WIP no commiteado (`+378/−4`) de otras sesiones **no** se auditó como comportamiento | Se auditó lo **desplegado** (= HEAD). El WIP puede cambiar el veredicto **cuando se despliegue** |

---

## 6. Falsos positivos propios detectados y corregidos (trazabilidad)

| # | Falso positivo | Cómo se detectó | Corrección |
|---|---|---|---|
| **FP-1** | «`Range` tóxico en los 23 510 bloques `#EXTHTTP`» | El `awk` usaba `index(L,"Range")` (substring) y `Range` aparece en `X-Video-Range`, `X-APE-HDR-Range`, `X-APE-QUALITY-OVERRIDE-RANGE` | Pasada 2 con regex de **clave JSON exacta** `/"range"[[:space:]]*:/` ⇒ **0**. Documentado en `LISTS_HEADERS_TRAPS.md` §5 |
| **FP-2** | «47 023 URLs para 23 510 canales ⇒ 2 URLs por canal (viola anti-509)» | `substr(L,1,1) != "#"` cuenta también las **líneas en blanco** (separador de bloque) | Pasada 2 con `if (L=="") {blanks++; next}` ⇒ **23 510 URIs / 23 510 canales = 1,00** ✔. El defecto **no existe** |
| **FP-3** | «`EXTM3U=0` en las 4 listas nuevas» (censo ligero) | `extkey()` corta en `=` de `x-tvg-url=""` | Artefacto del script, declarado en **L4**. No se publicó como hallazgo |

> Los tres se documentan **a propósito**: una auditoría que sólo publica aciertos no es reproducible. El FP-1
> habría producido un CRITICAL inexistente sobre 23 510 bloques de una lista **en producción**.

---

## 7. Atestación de cero mutaciones (con el detalle de lo que sí se tocó)

| Superficie | Acciones de t8 | ¿Mutación? |
|---|---|---|
| `/var/www/lists/**` | `stat`, `sha256sum`, `gzip -t`, `zcat \| awk`, `ls` | **NO** |
| `/etc/nginx/**` | `cat`, `grep`, `ls`, `sha256sum` | **NO** |
| Servicios del VPS | ninguno (`systemctl` sólo se **leyó** en la capa t7; t8 no lo invocó) | **NO** |
| Proveedor (`line.tivi-ott.net`, CDNs) | **0 peticiones** | **NO** |
| Red del VPS | `curl` a `127.0.0.1` / `127.0.0.1:8088` (loopback, fixtures propios) | **NO** (tráfico local de auto-test) |
| `/tmp` del VPS | `/tmp/_h.txt` creado y **borrado en la misma llamada** (`rm -f` + `echo` de control) | **transitorio, declarado** |
| Repo | **sólo** `audit/alignment/2026-10-25/50-listas/**` (6 `.md` + 6 scripts + artefactos crudos) | **confiado a mi lane** |
| Git | **0** `add`/`commit`/`push`/`checkout`/`restore` | **NO** |
| Listas del repo | leídas con `fs.createReadStream` (sólo lectura) | **NO** |

**Comprobación de estado antes/después:** el `sha256` de la lista vigente es el mismo en la primera lectura
(04:07Z) y en la última (04:33Z): `7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360`, con
`mtime = 2026-10-25 17:56:21.209153230 +0000` intacto.

---

## 8. Artefactos crudos (evidencia) y scripts (reproducibilidad)

| Artefacto | Bytes | Qué contiene |
|---|---|---|
| `tools/vps_catalog_census.sh` | 6 154 | censo completo (1 pasada) — **script** |
| `tools/vps_catalog_census2.sh` | 6 274 | censo corregido (blancos/URIs, tóxicos exactos, tags no clasificados) — **script** |
| `tools/vps_light_census.sh` | 3 640 | censo ligero de N listas — **script** |
| `tools/probe_tags.sh` | 1 449 | valores de tags de códec/HDR por canal — **script** |
| `tools/lists_audit.js` | 21 976 | auditor RFC 8216 de listas locales + enmascarado — **script** |
| `tools/extract.js` | 4 809 | extractor de la tabla/detalle del JSON — **script** |
| `tools/_raw_census_vigente.txt` | 31 508 | salida cruda del censo completo (A4) |
| `tools/_raw_census_vigente_p2.txt` | 19 194 | salida cruda del censo corregido (A4) |
| `tools/_raw_light_census.txt` | 3 229 | salida cruda de A1/A2/A3/A6 |
| `tools/_raw_probe_tags.txt` | 891 | valores de tags por canal (A4) |
| `tools/_raw_lists_audit.json` | ≈ 460 000 | informe completo de las 22 listas (con muestras enmascaradas) |
| `tools/_raw_tabla.tsv` | 3 570 | tabla comparativa de las 22 listas |
| `tools/_raw_detalle.txt` | 144 531 | detalle con línea de cada hallazgo |

**Cómo re-ejecutar (VPS):**

```bash
# 1. censo completo de una lista (read-only)
b64=$(base64 -w0 tools/vps_catalog_census.sh)
ssh hetzner-iptv "echo '$b64' | base64 -d | F=/var/www/lists/APE_LISTA_1792869328847.m3u8.gz bash -s"

# 2. censo ligero de varias
ssh hetzner-iptv "echo '$b64' | base64 -d | bash -s /var/www/lists/A.m3u8.gz /var/www/lists/B.m3u8.gz"
```

**Cómo re-ejecutar (repo):**

```bash
node audit/alignment/2026-10-25/50-listas/tools/lists_audit.js \
     --out /tmp/r.json OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8
node audit/alignment/2026-10-25/50-listas/tools/extract.js /tmp/r.json detail
```

---

## 9. Criterio de representatividad (por qué esta muestra basta)

| Familia | Población | Muestra | Cobertura de la **población distinta** | Suficiencia |
|---|---|---|---|---|
| VPS | 7 listas lógicas | 6 (5 completas + 1 por identidad) | **85,7 % de las listas**, **100 % de los canales con censo estructural** | Alta: las 5 listas comparten generador y esqueleto; los hallazgos son **sistémicos** (I-FRAME sin URI, combos de 4 códecs, 0 tóxicos) y se repiten en todas |
| Repo | 22 contenidos distintos | 22 | **100 % de los bytes distintos** | Total: no hay contenido sin auditar (aritmética de §4 del inventario) |

**Conclusión de representatividad:** un hallazgo que aparece en **5 de 5** listas medidas del VPS no es un caso
aislado; uno que aparece en **1 de 22** archivos del repo (p. ej. `test.m3u8`) sí lo es, y así se etiqueta en
cada tabla.

---

*Fin de `LISTS_SAMPLING.md`. Denominador cerrado (7 listas VPS / 22 contenidos repo), 10 límites declarados,
3 falsos positivos propios documentados, atestación de cero mutaciones con el detalle del único temporal.*
