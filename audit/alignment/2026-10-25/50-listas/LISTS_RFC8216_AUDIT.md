# LISTS_RFC8216_AUDIT — Auditoría RFC 8216 de las dos familias de listas

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana de medición:** `2026-10-26T04:07Z – 04:26Z`
**Naturaleza:** SOLO LECTURA. Cero escrituras en listas, en el VPS y en el repo fuera de `audit/alignment/2026-10-25/50-listas/`.
**Método y denominador:** ver `LISTS_SAMPLING.md`. **Inventario:** ver `LISTS_INVENTORY.md`.

Cada hallazgo cita **archivo:línea** y la evidencia medida. Los tokens/credenciales de las URLs se enmascaran;
las URLs del proveedor se reproducen sólo con host + estructura (`<CRED>` en los segmentos variables).

---

## 0. Resumen ejecutivo (una frase por familia)

| Familia | Veredicto RFC 8216 | Hallazgos | Lo que salva el veredicto |
|---|---|---|---|
| **A — servidas por el VPS** (catálogo vigente, 23 510 canales) | **CUMPLE CON DESVIACIONES** (no es un HLS Master/Media Playlist válido; es un catálogo M3U Plus con tags HLS encima) | 2 HIGH estructurales + 3 MEDIUM + 4 LOW/INFO | 1 URL/canal exacta, EXTHTTP 100 % JSON válido, 0 `EXT-X-MEDIA`, 0 duplicado de `VIDEO-RANGE`, audio preservado en 100 % de los `STREAM-INF` |
| **B — directas al proveedor** (listas del repo) | **FALLA en las listas históricas** (2026-03→2026-06); **CUMPLE** en las modernas (`lista_omega_v5.4`, catálogo del VPS) | 4 HIGH + 3 MEDIUM | las listas nuevas ya no emiten tóxicos; los tóxicos viven en las listas viejas que el repo conserva |

> **Hecho que domina el resto del informe:** la lista **vigente** del VPS (`APE_LISTA_1792869328847`, generador
> `22.6.0-MEMC-TOTAL-8K120`, `generatedAt 2026-10-24T19:18:29Z`) está **limpia de headers tóxicos** y **no tiene
> `EXT-X-MEDIA URI=`**. Los tóxicos y las violaciones graves que este informe documenta están en las **listas
> históricas versionadas en el repo** (hasta 718 MB de ellas), no en lo que hoy se sirve.

---

## 1. Familia A — catálogo servido por el VPS

**Artefacto auditado:** `/var/www/lists/APE_LISTA_1792869328847.m3u8.gz`
`size=297134088` · `mtime=2026-10-25 17:56:21.209153230 +0000` · `sha256=7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360` · `gzip -t: OK`
**Payload:** 22 271 732 líneas · 23 510 canales · 1 URL por canal.
Evidencia cruda: `tools/_raw_census_vigente.txt` (pasada 1) y `tools/_raw_census_vigente_p2.txt` (pasada 2 corregida).

### A-01 · HIGH · `#EXT-X-I-FRAME-STREAM-INF` sin el atributo `URI` (obligatorio)

| Dato | Valor medido |
|---|---|
| Ocurrencias | **23 510** (= 1 por canal) |
| Con `URI=` | **0** |
| Líneas de muestra | `1050`, `2001`, … (una cada ~947 líneas) |

```
1050|#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=375000,CODECS="hvc1.2.4.L153.B0"
```

* **Norma:** RFC 8216 §4.3.4.3 — `EXT-X-I-FRAME-STREAM-INF` es un tag de **Master Playlist** y su atributo
  `URI` es **REQUIRED** (identifica la Media Playlist de I-frames).
* **Causa raíz:** decisión doctrinal explícita y deliberada: `.gemini/settings/url.md` / `CLAUDE.md`
  «`#EXT-X-I-FRAME-STREAM-INF` → puede existir como METADATA pero **NUNCA con `URI=`**», para evitar
  HTTP 509 del proveedor (una sola conexión por canal).
* **Impacto real:** un parser estricto que trate el archivo como Master Playlist puede **rechazar la
  variante I-frame** (no el canal). Los players objetivo (OTT Navigator, TiviMate, VLC, Kodi, ExoPlayer)
  ignoran el tag. **No hay riesgo de pérdida de canal medido.** Es una **deuda doctrinal documentada**, no
  un bug: la doctrina gana a la norma aquí, y este informe lo registra como tal en vez de "arreglarlo".
* **Corrección propuesta (sólo si el propietario levanta la restricción anti-509):** añadir
  `URI="<mismo manifest>"` — pero eso duplica la petición por canal, que es exactamente lo que la
  doctrina prohíbe. **Recomendación: dejar como está y documentar la desviación.**

### A-02 · MEDIUM · Tags de *Media Playlist* (y de LL-HLS draft) en la raíz de un catálogo

```
1|#EXTM3U x-tvg-url="" … refresh="1800"
2|#EXT-X-VERSION:9
3|#EXT-X-INDEPENDENT-SEGMENTS
4|#EXT-X-APE-CHANNELS:23510
5|#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
6|#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=3.0
7|#EXT-X-TARGETDURATION:2
8|#EXT-X-PART-INF:PART-TARGET=1.0
…
57|#EXT-X-START:TIME-OFFSET=-14,PRECISE=YES
```

| Tag | Línea(s) | Ocurrencias | Estatus normativo |
|---|---|---|---|
| `#EXT-X-VERSION:9` | 2 | 1 | Tag básico; legal en ambos tipos. **HLS v9** exige soporte de `EXT-X-SKIP`/variables (v8) e IMSC1 (v9); ninguna de las dos se usa ⇒ versión sobredeclarada |
| `#EXT-X-START` | 5 **y 57** | **2** | Tag de Media Playlist (y de Master). Dos ocurrencias = la segunda gana/ambigua |
| `#EXT-X-SERVER-CONTROL` | 6 | 1 | **No existe en RFC 8216** (draft LL-HLS). Tag de Media Playlist |
| `#EXT-X-TARGETDURATION:2` | 7 | 1 | RFC 8216 §4.3.3.1 — **tag obligatorio de Media Playlist**, prohibido en Master Playlist |
| `#EXT-X-PART-INF` | 8 | 1 | No existe en RFC 8216 (draft LL-HLS). Tag de Media Playlist |
| `#EXT-X-MEDIA-SEQUENCE` | — | **0** | Correcto: ausente (un catálogo no debe llevarlo) |

* **Norma:** RFC 8216 §4.3.3 (Media Playlist tags) vs §4.3.4 (Master Playlist tags); un Master Playlist
  no puede contener tags de Media Playlist. El archivo **no es ninguna de las dos cosas**: es un catálogo
  M3U Plus (`#EXTINF` + URL por canal) al que se le añadió una cabecera HLS.
* **Por qué no es CRITICAL:** RFC 8216 §6.3.1 obliga a los clientes a **ignorar tags desconocidos**, y los
  players M3U Plus no interpretan la cabecera. La desviación es **formal**, no rompe reproducción medida.
* **Riesgo real:** un cliente que **sí** intente interpretar el archivo como Media Playlist (por
  `EXT-X-TARGETDURATION` + `EXT-X-VERSION` en la raíz) encontrará `#EXTINF:-1` y URIs `.m3u8` de canal en
  vez de segmentos ⇒ comportamiento indefinido. Ver `ll-hls-vs-classic-router` (separación estricta por tipo).
* **Corrección:** mover `EXT-X-TARGETDURATION`/`PART-INF`/`SERVER-CONTROL`/`START` al **bloque de canal**
  (donde sí aplican, si el canal es LL-HLS) o eliminarlos del catálogo. **No aplicado** (fuera de alcance
  de esta auditoría, que es sólo lectura).

### A-03 · MEDIUM · `CAN-BLOCK-RELOAD=YES` declarado sin implementación en el servidor

* **Declarado:** línea `6` → `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,…`
* **Medido:** `grep -rn "_HLS_msn\|_HLS_part" /etc/nginx/` ⇒ **0 coincidencias** (VPS, 2026-10-26T04:22Z).
  El vhost público que sirve `/lists/` **no contiene Lua** (`grep lua /etc/nginx/sites-enabled/default` ⇒ 0);
  el servicio es `gzip_static` estático (`default:101`, `default:147`).
* **Consecuencia:** un player LL-HLS que honre `CAN-BLOCK-RELOAD=YES` emitirá
  `?_HLS_msn=N&_HLS_part=K` y **mantendrá la conexión abierta** esperando que el servidor bloquee hasta que
  exista la parte pedida. Este servidor **jamás bloquea** (sirve el `.gz` completo, `Cache-Control: max-age=300`).
  El player recibe el mismo cuerpo al instante, no avanza ⇒ puede entrar en bucle de recarga.
* **Corrección:** o se implementa el blocking reload, o se emite `CAN-BLOCK-RELOAD=NO` (u omitir el tag).
  **Mitigante medido:** players no-LL-HLS (prácticamente todos los de la familia IPTV) ignoran el tag.

### A-04 · MEDIUM · Autodeclaración de validación con **falso PASS**

```
22271730|#EXT-X-APE-AUDIT-SCORECARD:{"v":"1","generatedAt":"2026-10-24T19:18:29.343Z","generatorVersion":"22.6.0-MEMC-TOTAL-8K120","channelsProcessed":23510,…,"duplicatesBlocked":259150,"jsonGuardFailures":0,…,"rfcViolations":[]}
22271732|#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,channels=23510,exthttp_valid=23510,errors=0,warnings=0,missing_uri=0,missing_bw=0,missing_dur=0,elapsed_ms=141095,…
```

* El generador declara `verdict=PASS`, `errors=0`, `rfcViolations":[]`.
* **Medido por esta auditoría:** 23 510 × `I-FRAME-STREAM-INF` sin `URI` (A-01) + 5 tags de Media Playlist en
  la raíz (A-02). Ninguna aparece en `rfcViolations`.
* **Conclusión:** el validador embebido **cumple su contrato declarado** (`missing_uri` se refiere a la URL
  de canal, y es 0 — correcto) pero **no cubre** la gramática de `EXT-X-I-FRAME-STREAM-INF` ni la separación
  Master/Media. **No es prueba independiente** de cumplimiento RFC; se cita como lo que es: una
  autodeclaración con cobertura parcial.

### A-05 · LOW · `#EXTINF` a ~947 líneas de su URI

Estructura medida de un bloque de canal (canal 1, líneas 122–1072):

```
122|#EXTINF:-1 tvg-id="3" tvg-name="|AL| TOP CHANNEL FHD …" group-title="EUROPA ORIENTAL / GENERALISTA / FULL HD" ape-profile="P3" …
123…#EXTVLCOPT / #KODIPROP / #EXT-X-APE-* (≈946 líneas)
1069|#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="hvc1.2.4.L150.B0,mp4a.40.2",VIDEO-RANGE=PQ,…,STABLE-VARIANT-ID="3_P3"
1070|#EXT-X-APE-FPS-SOURCE:probe
1071|http://line.tivi-ott.net/live/<CRED>/<CRED>/3.m3u8
1072|(línea en blanco)
```

* **Norma:** RFC 8216 §4.3.4.2 — `EXT-X-STREAM-INF` aplica a **la siguiente línea URI**; se cumple
  (entre `1069` y `1071` sólo hay un tag, no una URI). M3U Plus: `#EXTINF` aplica a la siguiente URI; también
  se cumple (no hay URIs intermedias).
* **Riesgo:** parsers ingenuos que esperen la URI **en la línea inmediatamente siguiente** al `STREAM-INF`
  fallarían por el tag `1070`. Los parsers reales no lo hacen. **Bajo.**

### A-06 · INFO · 39 % de los canales no declaran codec/resolución

| Métrica | Valor |
|---|---|
| Canales (`#EXTINF`) | 23 510 |
| Con `#EXT-X-STREAM-INF` | **14 343** (61,0 %) |
| **Sin** `#EXT-X-STREAM-INF` | **9 167** (39,0 %) |

* No es violación RFC (un catálogo M3U Plus no obliga a declarar variantes).
* **Efecto doctrinal:** esos 9 167 canales no expresan resolución/códec ⇒ el player decide solo; la
  declaración "MAX IMAGE FIRST" no los cubre. Coherente con el tier **F5** (sólo `EXTINF` + URL) que la
  doctrina exige para no perder canales.

### A-07 · LOW · Los 7 placeholders `.m3u8` son un catálogo vacío de 8 bytes

Los 7 `.m3u8` de `/var/www/lists` contienen exactamente `#EXTM3U\n` (8 B, sha `144659b4…313dd12` — ver
`LISTS_INVENTORY.md` §2). El contenido real vive en el `.gz` y se sirve por `gzip_static always` + `gunzip on`
(verificado end-to-end: `curl` al vhost devuelve `Content-Type: application/vnd.apple.mpegurl`,
`Transfer-Encoding: chunked`, `Cache-Control: max-age=300` y **ningún** header `X-APE-*`).
⇒ Mientras `gzip_static`/`gunzip` estén activos, **el servicio es correcto**; si un cambio de nginx los
desactiva, **todas las listas se sirven vacías** sin error visible. Riesgo operacional, no RFC.

---

## 2. Familia B — listas directas al proveedor (versionadas en el repo)

**Denominador:** 27 archivos `.m3u8` en disco (1 451 818 942 B) → **22 contenidos distintos auditados
línea a línea** (1 449 276 021 B) → **5 archivos son duplicados byte a byte** de otros ya auditados
(4 × `OMEGA_EXAMPLE_LIST.m3u8` sha `DC1795169E936AD8`, 1 × `lista_omega_v5.4.m3u8` sha `40473839DF673A69`).
Evidencia por archivo: `tools/_raw_lists_audit.json` y `tools/_raw_detalle.txt` (tabla resumen: `tools/_raw_tabla.tsv`).

### B-01 · HIGH · Los 6 headers tóxicos de la doctrina, presentes en el 100 % de los canales de 3 listas idénticas

| Archivo | Canales | `Range` | `If-None-Match` | `If-Modified-Since` | `TE` | `Priority` | `Upgrade-Insecure-Requests` |
|---|---|---|---|---|---|---|---|
| `OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 |
| `OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 |
| `downloaded_list.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 |

* Los 3 archivos tienen **el mismo sha256** `49AE918B…` salvo que `APE_OMEGA_PRODUCTION_v5.2.m3u8` es
  `8177C5CE…` (mismo tamaño, mismo nº de líneas, mismo nº de canales, mismos tóxicos ⇒ contenido casi
  idéntico, distinto hash). **444 MB de duplicado** en el repo.
* Además los 3 emiten `X-Requested-With` en el 100 % (trampa WAF #13 del checklist EXTHTTP).
* **Norma/doctrina:** los 6 son exactamente los prohibidos por `CLAUDE.md` («Headers PROHIBIDOS: causan
  EOF/304/403») y por `iptv-exthttp-traps-checklist` (trampa #9). Empíricamente producen
  `java.io.IOException: unexpected end of stream` en OTT Navigator/TiviMate/ExoPlayer.
* **Mitigante:** son listas **históricas** (mtime 2026-03-30 / 2026-04-02). La lista vigente del VPS **no**
  los tiene (verificado por clave exacta: 0/23 510). El riesgo es de **re-emisión**: si alguien regenera
  con la versión vieja del generador, vuelven.

### B-02 · HIGH · GOLDEN RULE rota: `hev1.*` dentro de `CODECS` de `EXT-X-STREAM-INF` (1 359/1 359 canales)

```
19|#EXT-X-STREAM-INF:BANDWIDTH=86000000,AVERAGE-BANDWIDTH=68800000,RESOLUTION=3840x2160,CODECS="avc1.640028,hev1.1.6.L153.B0,mp4a.40.2",FRAME-RATE=120,HDCP-LEVEL=NONE
703|… (idéntico) 1387|… 2071|… 2755|BANDWIDTH=35000000 … 3439|…
```

* **Archivo:** `temp_analysis/APE_TYPED_ARRAYS_ULTIMATE_20260319 (17).m3u8` (58 924 525 B, 1 359 canales).
* **Norma doctrinal (GOLDEN RULE):** `hvc1.*` **sólo** en `CODECS=` de `STREAM-INF`; `hev1.*` **sólo** en
  `KODIPROP`/`EXTVLCOPT`. Nunca cruzados (`ape-vps-hevc-crystal-integrator`, `iptv-hevc-cascade-injector`).
* **Agravante en la misma línea:** `avc1.640028` (AVC **L4.0**) y `hev1.1.6.L153.B0` (HEVC Main **8-bit**) se
  declaran **en el mismo `CODECS`** con `RESOLUTION=3840x2160`. Tres problemas en una línea: (a) `hev1` en
  el sitio prohibido, (b) dos códecs de vídeo distintos en un `CODECS` de una sola variante (RFC 8216
  §4.3.4.2 espera `codecs` de **esa** variante — audio sí, segundo vídeo no), (c) nivel/resolución imposible
  (ver `LISTS_CODEC_COHERENCE.md` §B-02).

### B-03 · HIGH · Lista de 718 MB con 4 tóxicos, `I-FRAME` sin URI, huella de motor y LCEVC inventado

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-26_audit_92_omega_premium/APE_LISTA_1777243113563_SHIELDED.m3u8`
**Medido:** 718 342 566 B · 14 332 124 líneas · 15 444 canales · sha `E9D3E52F94FC7ECB…`

| Hallazgo | Medición | Línea de evidencia |
|---|---|---|
| Tóxicos `Range` / `TE` / `Priority` / `Upgrade-Insecure-Requests` | 15 444 cada uno (100 %) | — |
| Huella de motor en headers (`OMEGA`/`CRYSTAL`) | **1 656** canales (trampa WAF #11) | — |
| `#EXT-X-I-FRAME-STREAM-INF` sin `URI` | 15 444 | — |
| Nivel HEVC < resolución (ver CODEC_COHERENCE) | **182** | `146714`, `3647130`, `3648058`, `3648986` |

```
146714|#EXT-X-STREAM-INF:BANDWIDTH=200000000,AVERAGE-BANDWIDTH=170000000,CODECS="hvc1.1.6.L153.B0,ec-3",RESOLUTION=7680x4320,FRAME-RATE=60.000,VIDEO-RANGE="PQ",HDCP-LEVEL="TYPE-1",SUPPLEMENTAL-CODECS="lcev.1"
```

* Nótese además: `VIDEO-RANGE="PQ"` y `HDCP-LEVEL="TYPE-1"` **entre comillas** → ver B-04 (gramática).
* `SUPPLEMENTAL-CODECS="lcev.1"` = **LCEVC inventado**, prohibido explícitamente por la doctrina
  («PROHIBIDO … `SUPPLEMENTAL-CODECS="lcev.1.1.1"` ← ELIMINADO»).

### B-04 · HIGH · Gramática RFC 8216: atributos enumerados entrecomillados y `EXTM3U` fuera de la línea 1

**(a) Atributos enumerados entrecomillados** — RFC 8216 §4.3.4.2 y §4.3.4.5 definen `VIDEO-RANGE` y
`HDCP-LEVEL` como *enumerated-string*: **no llevan comillas**. Medido:

```
1010|…CODECS="av01.0.08M.08,eac3",RESOLUTION=7680x4320,FRAME-RATE=120.000,VIDEO-RANGE="PQ",HDCP-LEVEL="TYPE-1",SUPPLEMENTAL-CODECS="lcev.1.1"
```

* Archivo: `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` (459 587 B, 10 canales; 1 por canal).
* Efecto: un parser que valide la gramática descarta el atributo (el canal sigue reproduciendo, pero pierde
  la pista HDR/HDCP). **Fijado en las listas modernas**: el catálogo vigente emite `VIDEO-RANGE=PQ` sin comillas
  (líneas `1069`, `2019`, …). ⇒ **defecto histórico, ya corregido en producción.**

**(b) `#EXTM3U` no es la primera línea** — RFC 8216 §4.3.1.1: el archivo **MUST** empezar por `#EXTM3U`.

| Archivo | `#EXTM3U` en línea | Primera línea real |
|---|---|---|
| `OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` | **9** | `#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE` |
| `OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8` | **9** | idem |
| `downloaded_list.m3u8` | **9** | idem |
| `test.m3u8` | **5** | `#EXTHTTP:User-Agent=OTT Navigator/2.1.6 …` |
| `OMEGA_EXAMPLE_LIST.m3u8` (×5 copias) | 1 **y otra** | `#EXTM3U` — **dos veces** (`count=2`) |

* Efecto: los players tolerantes leen igual (buscan `#EXTINF`), pero un validador RFC estricto rechaza el
  archivo completo. En `OMEGA_EXAMPLE_LIST` la segunda cabecera reinicia el estado de algunos parsers.

### B-05 · MEDIUM · `#EXTHTTP` que no es JSON ⇒ todos los headers se pierden

**Archivo:** `test.m3u8` (15 629 B, 203 líneas, 1 canal) — **4 de 6** bloques `#EXTHTTP` no parsean:

```
1|#EXTHTTP:User-Agent=OTT Navigator/2.1.6 (Android; TV) APE-Engine/v4.0.0-OMNISCIENT APE-Channel:AUTO|auto|P0 APE-Device:GENERIC_ANDROID_TV (CONTENT)
2|#EXTHTTP:X-Buffer-Target=5000
3|#EXTHTTP:X-Reconnect=true
4|#EXTHTTP:X-Failover=seamless
```

* **Trampa #6** del checklist (`#EXTHTTP` exige objeto JSON `{…}`): `JSON.parse` lanza ⇒ el player descarta
  **todo** el bloque y emite la petición con UA por defecto ⇒ 403 del proveedor por fingerprint.
* **Mitigante:** `test.m3u8` es un archivo de pruebas (nombre y contenido), no una lista servida. Pero es
  exactamente el patrón que la doctrina prohíbe y sigue en el repo.

### B-06 · MEDIUM · Un canal sin URL (catálogo irresoluble)

| Archivo | `#EXTINF` | Líneas URI | Déficit | Línea del huérfano |
|---|---|---|---|---|
| `OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` | 2 754 | 2 753 | **1** | **2 034 515** |

* El `#EXTINF` de la línea 2 034 515 no tiene URI asociada (el archivo termina en una cola de tags
  `#EXT-X-APE-LCEVC-*`). Ese canal **no es reproducible**. Es el tipo de defecto que la doctrina llama
  `missing_uri` y que la lista vigente del VPS no tiene (0/23 510).

### B-07 · LOW · Catálogos sin ninguna metadata de calidad (tier F5 puro)

| Archivo | Canales | `EXT-X-STREAM-INF` | `#EXTHTTP` | `tvg-logo` ausente |
|---|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/backend/lista_omega_v5.4.m3u8` | 8 366 | **0** | 0 | **8 366 (100 %)** |
| `lista_omega_mock.m3u8` | 100 | 0 | 0 | 100 (100 %) |

* Cumple el criterio 9 de la doctrina («F5 NO emite STREAM-INF»), pero al no haber `#EXTHTTP` **no hay
  User-Agent** ⇒ el proveedor recibe el UA del player (riesgo de 403) y no hay `tvg-logo` ⇒ sin carátula en EPG.

### B-08 · LOW · Nivel AVC insuficiente en un fixture de auto-test

```
4|#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=4000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.640028,mp4a.40.2"
```

* `_vps_stage/fixtures/selftest_master.m3u8` línea 4: AVC **L4.0** con 1080p@60 ⇒ requiere **L4.2**
  (MaxMBPS 244 800 vs 1080p60 ≈ 244 800 MB/s — al límite exacto). Es un fixture, no producción.

---

## 3. Lo que **NO** es hallazgo (verificado, para evitar falsos positivos)

| Comprobación | Resultado medido | Fuente |
|---|---|---|
| `EXT-X-MEDIA` con `URI=` en **catálogos** | **0** (ni en el VPS ni en ninguna lista de catálogo del repo) | censo A + auditoría B |
| `EXT-X-MEDIA` con `URI=` en **fixtures HLS** | 3 (`hls_master_hevc_main10`) y 1 (`hls_dolby_vision`) | **LEGÍTIMO**: RFC 8216 §4.3.4.1 lo exige en un Master real |
| `#EXTHTTP` JSON inválido en el catálogo del VPS | **0 / 23 510** | censo p2 `EXTHTTP_MALFORMADO=0` |
| Headers tóxicos en el catálogo del VPS (por **clave exacta**) | **0** en los 6 + `traceparent` + `X-Requested-With` | censo p2 |
| Dominio del VPS en `Referer`/`Origin` (trampa #14) | **0** — usa `https://www.netflix.com/` | censo p1 (muestra EXTHTTP) |
| `VIDEO-RANGE` duplicado en un mismo `STREAM-INF` | **0** (`CON_VIDEORANGE_DUPLICADO=0`) | censo p1 |
| Audio preservado dentro de `CODECS` | **14 343 / 14 343** (100 %) con `mp4a.40.2` | censo p1 |
| `hev1.*` en `CODECS` de `STREAM-INF` en el catálogo del VPS | **0** | censo p1/p2 |
| URLs por canal en el catálogo del VPS | **23 510 URIs / 23 510 canales = 1,00** | censo p2 |
| `EXT-X-MEDIA-SEQUENCE` en el catálogo | **0** (correcto) | censo p1 |
| `#EXTINF` con `tvg-id`/`tvg-name`/`group-title`/`tvg-logo` | **0 ausentes** (23 510/23 510) | censo p1 |

> **Nota de honestidad metodológica:** la primera pasada de este auditor reportó «`Range` tóxico en 23 510
> bloques». Era un **falso positivo propio**: el test era por *substring* y `Range` aparece en los **nombres**
> `X-Video-Range`, `X-APE-HDR-Range`, `X-APE-QUALITY-OVERRIDE-RANGE`. Corregido a **clave JSON exacta** en
> la pasada 2 ⇒ **0**. Se documenta porque un auditor que repita el error publicaría un CRITICAL inexistente.

---

## 4. Tabla de hallazgos (orden de severidad)

| ID | Sev. | Familia | Archivo:Línea | Defecto | Estado |
|---|---|---|---|---|---|
| B-01 | HIGH | B | `APE_OMEGA_PRODUCTION_v5.2` / `APE_TYPED_ARRAYS_ULTIMATE` / `downloaded_list` (2 754 canales c/u) | 6/6 headers tóxicos + `X-Requested-With` al 100 % | histórico, no en producción |
| B-02 | HIGH | B | `temp_analysis/…(17).m3u8:19,703,1387,…` | `hev1.*` en `CODECS` de `STREAM-INF` ×1 359 | histórico |
| B-03 | HIGH | B | `snapshots/…_SHIELDED.m3u8` (15 444 canales) | 4 tóxicos, `I-FRAME` sin URI, huella de motor, `lcev.1` | histórico (718 MB) |
| B-04 | HIGH | B | `audit_bulletproof_output.m3u8:1010`; `APE_OMEGA_*` línea 9; `test.m3u8:5` | enumerados entrecomillados; `EXTM3U` fuera de línea 1 | histórico |
| A-01 | HIGH | A | `APE_LISTA_1792869328847.m3u8.gz:1050,2001,…` | `I-FRAME-STREAM-INF` sin `URI` ×23 510 | **en producción**, deliberado (anti-509) |
| A-02 | MEDIUM | A | idem `:2,5,6,7,8,57` | 5 tags de Media Playlist / LL-HLS draft en la raíz | **en producción** |
| A-03 | MEDIUM | A | idem `:6` | `CAN-BLOCK-RELOAD=YES` sin implementación | **en producción** |
| A-04 | MEDIUM | A | idem `:22271730,22271732` | autodeclaración `rfcViolations:[]` con desviaciones reales | **en producción** |
| B-05 | MEDIUM | B | `test.m3u8:1,2,3,4` | `#EXTHTTP` no-JSON ×4 | archivo de pruebas |
| B-06 | MEDIUM | B | `APE_OMEGA_PRODUCTION_v5.2.m3u8:2034515` | canal sin URL | histórico |
| A-05 | LOW | A | idem `:122→1069→1071` | `EXTINF` a 947 líneas de su URI | **en producción**, legal |
| A-06 | INFO | A | idem (23 510 vs 14 343) | 39 % sin declaración de calidad | **en producción** |
| A-07 | LOW | A | `/var/www/lists/*.m3u8` (8 B) | placeholder vacío si falla `gzip_static` | **en producción** |
| B-07 | LOW | B | `lista_omega_v5.4.m3u8`, `lista_omega_mock.m3u8` | F5 puro, sin `#EXTHTTP` ni `tvg-logo` | histórico |
| B-08 | LOW | B | `_vps_stage/fixtures/selftest_master.m3u8:4` | AVC L4.0 a 1080p60 | fixture |

---

*Fin de `LISTS_RFC8216_AUDIT.md`. 16 hallazgos con archivo:línea; 4 HIGH; denominador declarado; cero mutaciones.*
