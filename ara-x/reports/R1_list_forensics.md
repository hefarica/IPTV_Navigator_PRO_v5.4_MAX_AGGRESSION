# R1 · Forense estructural de las dos listas APE (10.631 canales)

**Tarea:** `t2` (R1) · **Autor:** `hls-architect` (S1 · HLS/M3U8 RFC 8216 + S2 · LL-HLS/CMAF)
**Fecha:** 2026-10-30 · **Scope de escritura:** `ara-x/reports/**` + `ara-x/scripts/forensics/**` (no se tocó generador, VPS, APK ni lista servida)
**Artefactos:** este reporte + [`R1_findings.json`](R1_findings.json) + evidencia cruda en [`r1_evidence/`](r1_evidence/)
**Veredicto:** **ambas listas conservan el 100 % de los canales** (10.631, mismo orden, mismos `tvg-id`, mismas 10.631 URLs,
0 duplicados de URL/`tvg-id`), pero **ninguna es una playlist HLS válida** y **el 92,4 % declara en el wire un 4K/PQ que su
propia capa in-band desmiente**. No están "rotas": están **bien formadas como catálogo M3U Plus y mal formadas como HLS**.

---

## 0. Resumen ejecutivo

1. **Identidad preservada.** Local `572.170.477 B` / `E27C03EB…E2A680` y CDN `568.241.457 B` / `81DBDD11…BE14E`:
   **10.631 canales en ambos, mismo orden, mismos `tvg-id`, mismos hashes de URL (0 sólo-izquierda / 0 sólo-derecha)**.
   La regeneración del CDN **no perdió ni un canal ni mutó una URL**.
2. **La lista no es HLS.** Conviven en el mismo archivo **Media Segment tags** (`#EXTINF` ×10.631, `#EXT-X-DATERANGE` ×10.632),
   **Master Playlist tags** (`#EXT-X-STREAM-INF` ×10.631, `#EXT-X-I-FRAME-STREAM-INF` ×10.631, `#EXT-X-SESSION-DATA` ×N) y
   **Media Playlist tags** (`#EXT-X-TARGETDURATION:2`, `#EXT-X-PART-INF`, `#EXT-X-SERVER-CONTROL`). RFC 8216 §4.3.2:
   *"Clients MUST fail to parse Playlists that contain both Media Segment tags and Master Playlist tags"*. La lista funciona
   **porque los reproductores reales (TiviMate, OTT Navigator, VLC, Kodi) no cumplen esa obligación de cliente**.
3. **El 4K del wire es decorativo.** 10.631/10.631 `#EXT-X-STREAM-INF` declaran `RESOLUTION=3840x2160` +
   `hvc1.2.4.L153.B0` + `VIDEO-RANGE=PQ`; la capa in-band del mismo bloque dice **1280x720 (7.523)**, **1920x1080 (2.300)**,
   **3840x2160 (808)** ⇒ **9.823 canales (92,4 %) declaran un 4K que no existe en el bitstream**. Coincide con R2
   (`R2_codec_truth.md`: 70,76 % / 21,63 % / 7,60 %) por medición independiente.
4. **8K: cero wire, todo presentación.** `7680x4320` = **0 ocurrencias** en los 1.140 MB de ambas listas; `#EXT-X-APE-8KFAKE`
   con `ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` en 10.631 (local) y **808** (CDN). El ONN 4K nunca recibe una declaración 8K
   indescodificable — pero sí opciones VLC `adaptive-maxwidth=7680` / `adaptive-maxheight=4320` / `video-vrr_max=120`.
5. **LL-HLS declarado, inexistente.** 1 `#EXT-X-SERVER-CONTROL` (`CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0`),
   1 `#EXT-X-PART-INF:PART-TARGET=1.0`, **0** `#EXT-X-PART`, **0** `#EXT-X-PRELOAD-HINT`, **0** `#EXT-X-RENDITION-REPORT`.
   Además `PART-HOLD-BACK=1.0 < 3×PART-TARGET=3.0` (recomendación LL-HLS). Un cliente LL-HLS se quedaría esperando partes que no existen.
6. **CMAF/LCEVC/AI-SR son ficción de metadata.** 10.631 `#EXT-X-CMAF:*` con `CONTAINER:mpegts`, `INIT-SEGMENT:BYTERANGE="1024@0"`,
   `LCEVC:PHASE=4,ENABLED=true`, `AI-SR:MODEL=realesrgan,SCALE=4` — y **0 `#EXT-X-MAP`, 0 `#EXT-X-KEY`, 0 `#EXT-X-PROGRAM-DATE-TIME`**.
   Es exactamente lo que la doctrina del repo prohíbe ("CMAF/fmp4 falso sin `EXT-X-MAP` real").
7. **El CDN es una regeneración más honesta en las etiquetas APE y igual de mentirosa en el wire.** Frente al local:
   `#EXT-X-APE-4K-PREMIUM` y `#EXT-X-APE-8KFAKE` pasan de 10.631 → **808 (sólo P1)**; se cae **1 `#EXTATTRFROMURL` por canal**;
   **45 canales `|IL|` (ids 904505–904581 con huecos, perfil P4) pierden su `#EXT-X-STREAM-INF`**. El `RESOLUTION=3840x2160` del wire
   **sigue en los 10.586 restantes**.
8. **Divergencia no determinista (polimorfismo).** 30 familias de tags (UA/SPOOF) **rotan su contenido entre generaciones**
   (`PHANTOM-HYDRA-UA-VLC`: AFTKA→Roku; `SPOOF-IOS`: BRAVIA→Kodi; `network_user_agent`: GSE→Perfect Player), y el delta
   exacto de bytes es **3.929.020 B** repartidos en **34 tags**. Consecuencia para ARA-X: **la identidad byte-a-byte sólo vale
   dentro de una misma generación**; el pin debe ser `sha256` del artefacto, no "misma lista".
9. **Credenciales en el path, no en userinfo ni query.** Las 10.631 URLs son
   `https://iptv-ape.duckdns.org/cdn/<host-proveedor>/live/<seg6>/<seg6>/<streamId>.m3u8` con **1 solo valor distinto** en cada
   uno de los dos segmentos de 6 caracteres y **10.631 `streamId` distintos**: un **par cuenta/clave constante** viaja en el path
   de todas las URLs (forma Xtream), servido con `Access-Control-Allow-Origin: *`. R6 comprobó `user:pass@` y `username=`/`password=`
   (correctamente: 0); esta forma es ortogonal. **Valores no reproducidos en este informe.**
10. **Coste de parseo desproporcionado.** 10.169.562 líneas, **956,58 líneas/canal**, **53.820 B/canal**, **99,85 % metadata**
    y sólo **0,153 % URLs** (873.274 B, 82,1 B por URL). `#EXTHTTP` sola pesa **73,9 MiB** (7.196–7.495 B por canal, 193/203 headers).
    En un ONN 4K esto es el mayor riesgo estructural de zapping, no la calidad.

---

## 1. Artefactos, HTTP medido y método

### 1.1 Identidad de los dos artefactos

| | **A · local full capture** | **B · CDN servida** |
|---|---|---|
| Fichero | `ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8` | `ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8` |
| Origen | `GET /lists/APE_LISTA_4K.m3u8` (captura completa) | `GET /lists/APE_LISTA_1793397700248_CDN.m3u8` (descarga completa, `curl --max-time 1500`) |
| Bytes | **572.170.477** | **568.241.457** |
| sha256 | `E27C03EB45DACD6E5F19C3F4E016B456236CA2C06F485DDF11165DDC86E2A680` | `81DBDD11EC620B1DEAD702CA404C9959C61F301639A5D0091DA37EBFB95BE14E` |
| Líneas | 10.169.562 | 10.139.240 |
| Encoding / EOL | UTF-8 sin BOM · LF puro · termina en `\n` | idéntico |
| Cabecera | 128 líneas (127 no vacías), 103 nombres de tag | idéntico (3 líneas de timestamp/ID/fingerprint distintas) |
| `#EXT-X-APE-CHANNELS` | 10.631 | 10.631 |
| Footer `#EXT-X-APE-VALIDATED` | `RFC8216-STRICT,verdict=PASS,channels=10631,errors=0,warnings=0,missing_uri=0,missing_bw=0,missing_dur=0,elapsed_ms=95942` (ts `2026-10-29T10:51:07.924Z`) | `…verdict=PASS,channels=10631,…,elapsed_ms=123964` (ts `2026-10-30T22:04:02.825Z`) |
| Scorecard | `generatedAt 2026-10-29T10:49:31.982Z`, `duplicatesBlocked 116941`, `headerOverrides 1711591`, `rfcViolations []` | `generatedAt 2026-10-30T22:01:58.861Z`, mismos agregados |

### 1.2 HTTP medido (sólo cabeceras, sin cuerpo)
```
HTTP/1.1 200 OK                    Server: nginx
Content-Type: application/vnd.apple.mpegurl
Last-Modified: Fri, 30 Oct 2026 22:07:37 GMT
ETag: W/"6ae51529-9b2a1b7"          ← 0x9b2a1b7 = 162.701.751 B (artefacto gzip en disco)
Cache-Control: max-age=300 (público)   Access-Control-Allow-Origin: *
Accept-Ranges: bytes
```

Dos matices medidos, no teóricos:

- **`Accept-Ranges: bytes` no se honra.** Un `GET` con `Range: bytes=0-0` devuelve **`200` + `Transfer-Encoding: chunked`** y
  empieza a servir el cuerpo completo (se cortó a los 144.300.008 B por timeout de curl). No hay descarga reanudable de 546 MB.
- **El ETag codifica el gzip (162.701.751 B), no lo servido** (568.241.457 B sin `Accept-Encoding: gzip`, ratio 3,49×). El `gzip`
  on-the-fly implica que el `Range` no pueda honrarse; es coherente, pero conviene saberlo antes de cachear/proxear.

### 1.3 Regla de no-credenciales

Este informe **no reproduce** ningún valor sensible: ni usuario/clave del path, ni tokens, ni `#EXTHTTP` completos. Se publican
**longitudes, formas enmascaradas (`<6c>`), conteos y hashes**. Los nombres de canal y grupos sí se citan (son metadatos públicos
del catálogo). Mismo criterio que `R6_security.md`.

### 1.4 Herramientas y comandos (reproducibles, sin dependencias npm)
```powershell
node ara-x/scripts/forensics/r1_analyze.js    ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8 --out ara-x/reports/r1_evidence/local_full.json --label "local"
node ara-x/scripts/forensics/r1_analyze.js    ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8 --out ara-x/reports/r1_evidence/cdn_full.json  --label "cdn"
node ara-x/scripts/forensics/r1_probe.js      ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8 --out ara-x/reports/r1_evidence/probe_local.json
node ara-x/scripts/forensics/r1_probe2.js     ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8 --out ara-x/reports/r1_evidence/probe2_local.json
node ara-x/scripts/forensics/r1_fingerprint.js ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8 ara-x/reports/fp_local.jsonl
node ara-x/scripts/forensics/r1_fingerprint.js ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8  ara-x/reports/fp_cdn.jsonl
node ara-x/scripts/forensics/r1_compare.js    ara-x/reports/fp_local.jsonl ara-x/reports/fp_cdn.jsonl --out ara-x/reports/r1_evidence/compare.json
node ara-x/scripts/forensics/r1_crosstab.js   ara-x/reports/fp_local.jsonl --out ara-x/reports/r1_evidence/xtab_local.json
node ara-x/scripts/forensics/r1_digest.js     ara-x/reports/r1_evidence/local_full.json --top 12
```

Los `*.jsonl` de huellas (5,7 MB cada uno) **no se versionan**: se regeneran en ~50 s cada uno con los dos comandos de
`r1_fingerprint.js`. Los JSON agregados sí quedan en `ara-x/reports/r1_evidence/` (≈ 280 KB totales).

### 1.5 Chequeos exigidos por R1

| Chequeo pedido | Resultado A | Resultado B |
|---|---|---|
| Footer `#EXT-X-APE-VALIDATED` presente | **PASS** (`verdict=PASS,channels=10631,errors=0`) | **PASS** (`verdict=PASS,channels=10631,errors=0`) |
| `EXTINF == #EXT-X-APE-CHANNELS` | **PASS** (10.631 = 10.631) | **PASS** (10.631 = 10.631) |
| Descarga completa (no truncada) | `sha256` reproducido 2×, termina en `\n`, footer íntegro, 0 líneas parciales | `sha256 81DBDD11…BE14E` reproducido 2× (`Get-FileHash`), termina en `\n`, footer íntegro, descarga cerrada dentro de la ventana de 1500 s |
| Identidad byte-a-byte declarada | `572.170.477 B` | `568.241.457 B` |

> Nota de honestidad: el footer `VALIDATED` es **autocertificación del generador** (no un validador independiente). R1 lo
> registra como *presencia y coherencia de conteos*, no como prueba de conformidad RFC — de hecho §4 demuestra que la lista
> **no** es RFC-válida pese al `verdict=PASS`.

---

## 2. Estructura medida

### 2.1 Esqueleto (idéntico en ambas listas)

```
líneas 1–127    cabecera global APE (103 nombres de tag; VERSION:9, INDEPENDENT-SEGMENTS, START ×2,
                SESSION-DATA ×~30, LAB-PROFILE-P0..P5, SYS-*, CDN-PLANE, QOE-ENGINE …)
línea 128       en blanco
por canal       1 × #EXTINF (19 atributos) + ~930 líneas de metadata + 1 × #EXT-X-STREAM-INF + URL
                (bloque de 949–962 líneas; 52.319–55.068 B)
línea final     3 líneas en blanco + #EXT-X-APE-AUDIT-SCORECARD + #EXT-X-APE-VALIDATED
```

### 2.2 Tabla comparativa

| Métrica | A · local | B · CDN | Δ |
|---|---|---|---|
| Bytes | 572.170.477 | 568.241.457 | −3.929.020 |
| Líneas | 10.169.562 | 10.139.240 | −30.322 |
| Líneas en blanco | 10.634 | 10.634 | 0 |
| `#EXTINF` | 10.631 | 10.631 | 0 |
| URLs (líneas de canal) | 10.631 | 10.631 | 0 |
| `#EXT-X-STREAM-INF` | 10.631 | **10.586** | **−45** |
| `#EXT-X-I-FRAME-STREAM-INF` | 10.631 | 10.631 | 0 |
| `#EXTATTRFROMURL` | 584.705 (**55**/canal) | 574.074 (**54**/canal) | −10.631 |
| `#EXT-X-APE-4K-PREMIUM` | 10.631 | **808** | −9.823 |
| `#EXT-X-APE-8KFAKE` | 10.631 | **808** | −9.823 |
| `#EXTHTTP` | 10.631 (JSON válido 10.631) | 10.631 (JSON válido 10.631) | 0 |
| `#EXTVLCOPT` | 1.413.923 (**133,00**/canal) | 1.413.923 (133,00) | 0 |
| `#KODIPROP` | 1.094.993 (**103,00**/canal) | 1.094.993 (103,00) | 0 |
| `#EXT-X-DATERANGE` | 10.632 (10.632 IDs únicos) | 10.632 (10.632 IDs únicos) | 0 |
| Nombres de tag distintos | **772** (103 en cabecera) | 772 | 0 |
| Líneas/canal (min–max, media) | 949–962 · **956,58** | 944–960 · **953,73** | −2,85 |
| Bytes/canal (min–max, media) | 52.319–55.068 · **53.820** | 52.319–55.068 · **53.450** | −370 |
| Metadata / payload | **99,85 % / 0,153 %** | **99,84 % / 0,154 %** | — |
| Bloque `#EXT-X-STREAM-INF` adyacente a su URL | 10.631 / 10.631 | 10.586 / 10.586 | 0 malformados |
| Bloques con 0 / >1 URL | 0 / 0 | 0 / 0 | 0 |
| Duplicados URL exacta / normalizada | 0 / 0 | 0 / 0 | 0 |
| Duplicados `tvg-id` | 0 | 0 | 0 |
| Duplicados `tvg-name` (y name+group) | **108** | **108** | 0 |
| `#EXT-X-ARA-*` | **0** | **0** | 0 |

### 2.3 Inventario de tags (top por bytes, lista A)

| Tag | Líneas | Bytes | % del archivo |
|---|---|---|---|
| `#EXTHTTP` | 10.631 | 77.448.777 (**73,9 MiB**) | 13,5 % |
| `#KODIPROP` | 1.094.993 | 67.708.784 (64,6 MiB) | 11,8 % |
| `#EXTVLCOPT` | 1.413.923 | 53.510.137 (51,0 MiB) | 9,4 % |
| `#EXTATTRFROMURL` | 584.705 | 27.213.478 (26,0 MiB) | 4,8 % |
| `#EXTINF` | 10.631 | 5.500.233 | 1,0 % |
| `#EXT-X-APE-DNR-POLICY` | 10.631 | 3.636.318 | 0,6 % |
| `#EXT-X-STREAM-INF` | 10.631 | 2.848.883 | 0,5 % |
| `#EXT-X-DATERANGE` | 10.632 | 2.517.371 | 0,4 % |
| `#EXT-X-PHANTOM-HYDRA-UA-OTT` | 10.631 | 1.395.209 | 0,2 % |
| `#EXT-X-PHANTOM-HYDRA-UA-VLC` | 10.631 | 1.393.940 | 0,2 % |
| … 762 tags restantes | — | — | ~57 % |

**Lectura:** el 99,85 % del archivo es metadata declarativa; la "señal útil" (URLs) son 873.274 B. Los tres bloques
`#EXTHTTP` + `#KODIPROP` + `#EXTVLCOPT` suman **198.667.698 B (189,5 MiB, 34,7 %)** del artefacto.

### 2.4 Perfiles y verdad por perfil (cross-tab, lista A)

| Perfil | n | `ape-fps` | `X-Resolution` | `X-Codec-Full` | `X-HDR-Nits` | `X-Expected-Bitrate` | `BANDWIDTH` wire | `FRAME-RATE` wire |
|---|---|---|---|---|---|---|---|---|
| **P1** | 808 | 50 (824 global) | 3840x2160 | `hvc1.2.4.L153.B0` | 1500 | 40.000.000 | 28.000.000 (808) | 30 (643) / 60 (165) |
| **P3** | 2.300 | 25 | 1920x1080 | `hvc1.2.4.L123.B0` | 400 | 15.000.000 | 12.000.000 (572) / 9.000.000 (1.728) | 60 (572) / 30 (1.728) |
| **P4** | 7.523 | 25 | 1280x720 | `hvc1.2.4.L93.B0` | 100 | 10.000.000 | 9.000.000 (6.293) / 12.000.000 (1.185) / **28.000.000 (45)** | 30 (6.338) / 60 (1.185) |

`ape-codec-family`: **h264 = 9.593 (90,24 %)** · hevc = 1.038. `VIDEO-RANGE=PQ` y `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"`:
**10.631** en el wire. Conclusión aritmética: **9.823 canales declaran wire 4K/PQ/L153 con metadata 720p/1080p y codec-family h264**.

---

## 3. Comparación A/B (qué cambió y qué no)

### 3.1 Invariantes idénticos (verificados índice a índice, 10.631 posiciones)

| Campo | Iguales en la misma posición | Distintos |
|---|---|---|
| `tvg-id` | **10.631** | 0 |
| hash de URL / host / esquema | **10.631** | 0 |
| `ape-profile` | **10.631** | 0 |
| `ape-codec-family`, `ape-fps` | **10.631** | 0 |
| `X-Resolution`, `X-Codec-Full`, `X-Video-Range` | **10.631** | 0 |
| nº de headers `#EXTHTTP` (193/203) | **10.631** | 0 |
| `HDCP-LEVEL` | **10.631** | 0 |
| `BANDWIDTH`/`RESOLUTION`/`CODECS`/`FRAME-RATE`/`VIDEO-RANGE` | 10.586 | **45** (valor → ausencia) |
| `#EXT-X-APE-8KFAKE` presente | 808 | **9.823** |
| líneas del bloque | 0 | **10.631** (todos difieren) |

Conjuntos de URL: **10.631 compartidas, 0 sólo en A, 0 sólo en B**. Conjuntos de `tvg-id`: **10.631 compartidos**.
**No hay pérdida de canales ni sustitución de endpoints.**

### 3.2 Delta exacto (34 tags con diferencia de bytes; 4 con diferencia de líneas)

| Tag | Líneas A→B | Δ bytes | Interpretación |
|---|---|---|---|
| `#EXTATTRFROMURL` | 584.705 → 574.074 | −3.084.846 | una línea menos por canal |
| `#EXT-X-APE-8KFAKE` | 10.631 → 808 | −550.088 | 8K fake sólo en P1 |
| `#EXT-X-APE-4K-PREMIUM` | 10.631 → 808 | −284.867 | 4K premium sólo en P1 |
| `#EXT-X-STREAM-INF` | 10.631 → 10.586 | −6.930 | 45 canales sin variante |
| `PHANTOM-HYDRA-UA-VLC` + `APE-SPOOF-VLC` | 10.631 → 10.631 | −24.476 | **rotación de UA** entre generaciones |
| `PHANTOM-HYDRA-UA-TIER2` + `APE-SPOOF-IOS` | 10.631 → 10.631 | +17.178 | ídem |
| `KODIPROP` | 1.094.993 → 1.094.993 | −10.875 | `network_user_agent` y similares rotan |
| **Σ (34 tags)** | — | **−3.929.020** | **= delta de bytes del archivo (exacto)** |

Delta de líneas: 30.322 = 10.631 (EXTATTRFROMURL) + 9.823 (4K-PREMIUM) + 9.823 (8KFAKE) + 45 (STREAM-INF). **Cuadra al byte.**

Delta por canal: **P1 −1** (conserva 4K-PREMIUM/8KFAKE), **P3 −3**, **P4 −3**, **45 P4 −4** (además pierde STREAM-INF).

### 3.3 Las 45 excepciones

Canales `|IL|` con `tvg-id` **904505–904581** (bloque casi contiguo con huecos, perfil **P4**, `BANDWIDTH=28.000.000`), que en A ya eran
anómalos (su `#EXT-X-STREAM-INF` **no** llevaba `HDCP-LEVEL`, `COLOR-PRIMARIES` ni `TRANSFER-CHARACTERISTICS`) y en B
**pierden el `#EXT-X-STREAM-INF` por completo** (bloque de 944 líneas, 0 variantes). El footer de B sigue diciendo
`errors=0, missing_uri=0, missing_bw=0`: el validador no considera "canal sin variante" un error. **No es pérdida de canal**
(la URL sigue), pero rompe la simetría 1:1 `EXTINF == STREAM-INF` que el resto del ecosistema asume.

### 3.4 Cabecera y footer

Sólo **3 líneas** de cabecera difieren: `#EXT-X-SYS-GENERATED` (`2026-10-29T10:49:32Z` → `2026-10-30T22:01:59Z`),
`#EXT-X-SYS-LIST-ID` (`APE_LAB_9zdfpzfc8hog` → `APE_LAB_g2pph2csp4oi`) y `#EXT-X-SYS-FINGERPRINT`. El resto (incluido
`#EXT-X-APE-LAB-DNA`, `#EXT-X-START` ×2, `#EXT-X-SERVER-CONTROL`, `#EXT-X-TARGETDURATION`, `#EXT-X-PART-INF`) es idéntico.
Footers: mismo formato, timestamps y `elapsed_ms` distintos (95.942 → 123.964).

**Lectura de las dos listas:** B es la misma lista regenerada ~35 h después, con la **capa APE de 4K/8K corregida a la verdad
por perfil** (premium/8Kfake sólo en P1) pero con **la capa HLS del wire intacta** (4K/PQ/L153 en 10.586). Es decir: se corrigió
la etiqueta, no la declaración que leen los reproductores. Y la regeneración **muta UA/SPOOF** por diseño (polimorfismo), por lo
que "byte-idéntico" sólo tiene sentido intra-generación.

---

## 4. Conformidad RFC 8216 y placement (citas normativas)

| # | Hecho medido | Norma | Consecuencia |
|---|---|---|---|
| 1 | `#EXTINF` (Media Segment tag) + `#EXT-X-STREAM-INF` (Master tag) en el mismo archivo, ×10.631 | **RFC 8216 §4.3.2**: *"A Media Segment tag MUST NOT appear in a Master Playlist. Clients MUST fail to parse Playlists that contain both Media Segment tags and Master Playlist tags"* | Un cliente estricto **debe** rechazar el archivo. Funciona por indulgencia de los players M3U. |
| 2 | `#EXT-X-TARGETDURATION:2`, `#EXT-X-PART-INF`, `#EXT-X-SERVER-CONTROL` en el catálogo | **§4.3.3**: *"A Media Playlist tag MUST NOT appear in a Master Playlist"* | Viola placement; declara LL-HLS sin segmentos. |
| 3 | 10.631 `#EXT-X-STREAM-INF` = 10.631 **canales distintos** | **§6.2.4**: *"Each Variant Stream MUST present the same content"* | Semánticamente no es un master: es un catálogo disfrazado de master. |
| 4 | 10.631 `#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=375000,CODECS="hvc1.2.4.L123.B0"` — **sin `URI`**, idénticos entre sí | **§4.3.4.3**: *"Every EXT-X-I-FRAME-STREAM-INF tag MUST include a BANDWIDTH attribute and a URI attribute"* | 10.631 violaciones; trick-play inútil (mismo valor para 10.631 canales). |
| 5 | `#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES` (línea 7) **y** `#EXT-X-START:TIME-OFFSET=-14,PRECISE=YES` (línea 57) | **§4.3.5.2** define *un* punto de arranque preferido (TIME-OFFSET REQUIRED) | Dos valores contradictorios (3 s vs 14 s): comportamiento dependiente del player (first/last-wins). |
| 6 | `#EXT-X-VERSION:9` + footer `RFC8216-STRICT … verdict=PASS` | RFC 8216 *"describes version 7 of the protocol"*; §7 sólo define 1–7 | La etiqueta "RFC8216-STRICT" es inexacta; v9 pertenece a la 2.ª edición HLS (no a RFC 8216). |
| 7 | `#EXTINF:-1,…` ×10.631 | **§4.3.2.1**: duración es un número decimal (no negativo) | Convención M3U Plus, no HLS. Refuerza que el artefacto es **catálogo**, no playlist. |
| 8 | 0 `#EXT-X-MAP` / 0 `#EXT-X-KEY` / 0 `#EXT-X-PROGRAM-DATE-TIME` / 0 `#EXT-X-ENDLIST` / 0 `#EXT-X-MEDIA-SEQUENCE` | tags requeridos por su propia semántica si se declara CMAF/LL-HLS | Confirma que la capa "moderna" es decorativa. |
| 9 | `#EXT-X-DATERANGE` ×10.632 con **10.632 IDs únicos** | **§6.2.1**: el servidor MUST NOT reutilizar el ID de un Date Range | ✔ Correcto: no hay colisión de IDs (el único conflicto es semántico, ver §5.3). |

---

## 5. Auditoría de declaraciones (4K / HDR / 8K / CMAF / LL-HLS)

### 5.1 Cuatro verdades distintas en el mismo bloque de canal

Ejemplo P4 (canal 0 de la lista, `ape-profile="P4"`):

| Capa | Declaración | Valor |
|---|---|---|
| `#EXTINF` (público M3U) | `ape-codec-family`, `ape-fps` | `h264`, `25` |
| `#EXT-X-CMAF` (in-band "real") | `RESOLUTION`, `CODECS`, `BANDWIDTH` | `1280x720`, `hvc1.2.4.L123.B0`, `15.000.000` |
| `#EXTHTTP` (atributos) | `X-Resolution`, `X-Codec-Full`, `X-Video-Range`, `X-HDR-Nits` | `1280x720`, `hvc1.2.4.L93.B0`, `SDR`, `100` |
| `#EXT-X-DATERANGE` (panel) | `X-HDR-TYPE`, primarias, transfer, bit depth | `SDR`, `BT.709`, `BT.1886`, `8` |
| **`#EXT-X-STREAM-INF` (lo que lee el player)** | `RESOLUTION`, `CODECS`, `VIDEO-RANGE`, `COLOR-PRIMARIES`, `TRANSFER-CHARACTERISTICS` | **`3840x2160`, `hvc1.2.4.L153.B0,mp4a.40.2`, `PQ`, `9`, `16`** |

**Cuatro capas coherentes entre sí (720p/SDR) y una quinta (el wire) que las contradice.** R2 lo atribuye al post-pase
`_apeApply4kFake`; R1 lo confirma estructuralmente: el `#EXT-X-STREAM-INF` es el **único** lugar del bloque donde aparece "4K/PQ",
y es justo el que los reproductores interpretan.

### 5.2 4K / PQ / L153

- `RESOLUTION=3840x2160`: **10.631/10.631** (A) · **10.586/10.586** (B).
- `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"`: idéntico conteo. `CODECS` **no incluye `avc1`** en ninguna línea (0 literales `avc1`).
- `VIDEO-RANGE=PQ`: idéntico. `COLOR-PRIMARIES=9` (BT.2020) y `TRANSFER-CHARACTERISTICS=16` (PQ) en 10.586.
- `BANDWIDTH` para 4K declarado: **8.021 canales a 9 Mbps**, 1.757 a 12 Mbps, 853 a 28 Mbps. Frente a la tabla del propio repo
  (4K ⇒ 28 Mbps) eso marca **9.778 canales (92,0 %) como 4K con bitrate insuficiente**: la firma clásica de upscale.
- `SUPPLEMENTAL-CODECS`: **0** (bien: no se declara capa DV/LCEVC en el wire).

### 5.3 HDR: contradicción en tres direcciones

| Evidencia | Valor | Canales |
|---|---|---|
| `VIDEO-RANGE=PQ` (wire) | PQ | 10.631 / 10.586 |
| `X-Video-Range` (`#EXTHTTP`) | **SDR** | **10.631 (todos)** |
| `#KODIPROP … hdr_mode=SDR` | SDR | 9.823 (los 808 P1 usan `PQ`) |
| `#EXT-X-APE-HDR-TRANSFER` | **BT1886** (EOTF SDR, no PQ) | 10.631 |
| `#EXT-X-APE-HDR-DV:MODE` | `SDR` 9.823 · `PQ` 808 | 10.631 |
| `#EXT-X-APE-DV-PROFILE` / `LEVEL` | `8` / `6` | 10.631 |
| `#EXT-X-CMAF-DOLBY-VISION` | `PROFILE=8,LEVEL=6,ENABLED=true` | 10.631 |
| `#EXT-X-DATERANGE` (cabecera) | `X-HDR-TYPE="HDR10+DV-P81-P10"`, `X-HDR-MAX-CLL=10000` | 1 (global) |
| `#EXT-X-DATERANGE` por canal | `X-HDR-TYPE=SDR`/`SDR + HLG fallback`, `BT.709`, `BT.1886` | 10.631 |
| **`#EXT-X-APE-HDR-METADATA`** | `PEAK=100,AVG=1000` (×7.523) · `PEAK=400,AVG=1000` (×2.300) · `PEAK=1500,AVG=1000` (×808) | 10.631 |

**Dos errores formales además del semántico:**

1. **MaxFALL > MaxCLL** en **9.823 canales** (`AVG=1000` con `PEAK=100` o `400`): el nivel medio de luz **no puede** superar el
   máximo por píxel. Cualquier consumidor de metadata HDR estática (Kodi, ExoPlayer) recibe un valor imposible.
2. **DV Profile 8 declarado sin `dvcC`/`hvcC` posible**: no hay fMP4 (0 `#EXT-X-MAP`), así que la señalización DV no tiene dónde vivir.

### 5.4 8K (la buena noticia y la arista)

- **`7680x4320` = 0 ocurrencias** en ambas listas (1.140 MB). **`RESOLUTION` 8K: 0.** El ONN 4K **no recibe jamás una declaración
  8K en el wire** → no se le puede pedir un decode imposible por esta vía.
- `#EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` ×10.631 (A) / 808 (B) — inertes (RFC 8216 §6.3.1: tags desconocidos se ignoran).
- Tokens "8K" en texto: **5 líneas** (`generatorVersion 22.6.0-MEMC-TOTAL-8K120`, nombres de perfil `8K Master`).
- **Arista real:** `#EXTVLCOPT:adaptive-maxwidth=7680`, `adaptive-maxheight=4320`, `video-vrr_max=120`, `video-fps=60`,
  `video-filter=…minterpolate=fps=120…` en los 10.631 bloques. Son knobs de **cliente VLC**, no wire, pero empujan al decoder
  hacia 8K/120 Hz — exactamente el escenario de la Ley Cardinal 1 (`L153` = 4K@60 techo; 8K@120 = freeze 2026-06-08).

### 5.5 CMAF / LCEVC / AI-SR / AI-FI: metadata sin sustrato

| Declaración | Conteo | Sustrato real |
|---|---|---|
| `#EXT-X-CMAF:*` (25 nombres de tag) | 10.631 cada uno | `CONTAINER:mpegts`; **0** `#EXT-X-MAP`; **0** `.m4s` |
| `#EXT-X-CMAF-INIT-SEGMENT:BYTERANGE="1024@0"` | 10.631 | No hay init segment fMP4 |
| `#EXT-X-CMAF:CODECS="hvc1.2.4.L123.B0,"` | 10.631 | **coma final** → segundo códec vacío (malformado) |
| `#EXT-X-CMAF-LCEVC:PHASE=4,ENABLED=true` | 10.631 | Sin capa LCEVC en el bitstream |
| `#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4` | 10.631 | El VPS no procesa píxeles |
| `#EXT-X-APE-AI-FI:MODEL=rife_v4,FPS=60` | 10.631 | Ídem |
| `#EXT-X-CMAF-DOLBY-VISION:PROFILE=8,LEVEL=6` | 10.631 | Sin DV en el bitstream |

Coincide con R2 §0 (prohibiciones explícitas) y con la doctrina del repo: **CMAF real exige `#EXT-X-MAP` + `.m4s`/`init.mp4`.**

### 5.6 LL-HLS: declarado y ausente

```
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=3.0
#EXT-X-TARGETDURATION:2
#EXT-X-PART-INF:PART-TARGET=1.0
```

- `#EXT-X-PART` = 0 · `#EXT-X-PRELOAD-HINT` = 0 · `#EXT-X-RENDITION-REPORT` = 0 · `#EXT-X-SKIP` = 0.
- `PART-HOLD-BACK=1.0` con `PART-TARGET=1.0` ⇒ **1× en vez del mínimo recomendado 3×**.
- `CAN-SKIP-UNTIL=12.0` = 6 × `TARGETDURATION` (justo en el límite recomendado).
- `CAN-BLOCK-RELOAD=YES` sin partes ⇒ un cliente LL-HLS **bloquearía la recarga** esperando partes inexistentes.

**Recomendación (para R3/D3):** no emitir `#EXT-X-SERVER-CONTROL`/`#EXT-X-PART-INF`/`#EXT-X-TARGETDURATION` en el catálogo.
Si se quiere LL-HLS, se genera **en la media playlist de cada canal**, con `PART-HOLD-BACK ≥ 3 × PART-TARGET`.

---

## 6. Duplicados y unicidad

| Objeto | Únicos | Duplicados | Comentario |
|---|---|---|---|
| URL exacta | 10.631 | **0** | ✔ invariante cumplida |
| URL normalizada (sin query) | 10.631 | **0** | ✔ (0 URLs con query) |
| `tvg-id` | 10.631 | **0** | ✔ |
| `tvg-name` | 10.523 | **108** | ✘ 108 nombres repetidos (con distinto id/URL/grupo) |
| `tvg-name`+`group-title` | 10.523 | **108** | mismo conjunto |
| `#EXT-X-DATERANGE` ID | 10.632 | **0** | ✔ (RFC §6.2.1) |
| `SID` de `#EXT-X-CMAF-IDEMPOTENCIA` | 10.630 | **1** | colisión única contra la promesa "1PCT_UNIQUENESS" |
| `X-APE-SPOOF-IP` distintos | 600 | — | pool de IPs de spoof (rotación) |

El scorecard declara `duplicatesBlocked: 116.941` — **más que el tamaño del catálogo**, así que ese contador no es "canales
duplicados bloqueados" sino eventos de deduplicación por línea; no debe citarse como prueba de 0 duplicados. La prueba real es
la tabla anterior (0 URL, 0 `tvg-id`, 108 nombres).

---

## 7. Seguridad (S10) — lo que R1 añade a R6

- **Forma de las URLs (10.631, idéntica en A y B):** `https://iptv-ape.duckdns.org/cdn/<host-proveedor>/live/<seg6>/<seg6>/<streamId>.m3u8`
  con **1 solo valor distinto** en cada `<seg6>` y **10.631 `streamId` distintos**. Es la forma Xtream `/live/{user}/{pass}/{id}`
  servida bajo el prefijo `/cdn/`. **Los valores no se reproducen aquí.**
- **R6 comprobó otra cosa (correctamente):** `user:pass@`, `username=`, `password=` → 0. El par cuenta/clave **no viaja en
  userinfo ni en query**, viaja como **dos segmentos de path constantes**. Ambas mediciones son ciertas y compatibles.
- **Superficie:** `Access-Control-Allow-Origin: *` sobre un artefacto que contiene ese par constante en 10.631 URLs +
  584.705 URLs `/a/` + 600 IPs de spoof. Cualquier origen web puede leerlo.
- **Buenas noticias medidas:** `#EXTHTTP` **0 headers tóxicos** (ni `Range`, `If-None-Match`, `If-Modified-Since`, `TE`,
  `Priority`, `Upgrade-Insecure-Requests`) en 10.631 bloques, JSON válido 10.631/10.631; **0 `URI=`** en `#EXT-X-MEDIA`
  (0 instancias) y en `#EXT-X-I-FRAME-STREAM-INF` (invariante anti-509 cumplida); **0 `#EXT-X-ARA-*`** (sin secretos ARA).
- **Cabecera de spoofing** (`Referer`/`Origin` netflix.com, `Sec-GPC`, `DNT`, `X-APE-SPOOF-*`): es un riesgo de reputación/
  WAF, no de credential leak; queda documentado en R6.

---

## 8. Qué impide que sean "perfectas" (F-01 … F-20)

Severidad: **CRITICAL** = rompe reproducción/verdad de forma sistémica · **HIGH** = viola norma o expone superficie ·
**MEDIUM** = degrada operación/diagnóstico · **LOW** = higiene.

| ID | Sev | Capa | Hallazgo | Evidencia | Corrección requerida |
|---|---|---|---|---|---|
| **F-01** | CRITICAL | S1 | **Gramática híbrida**: Media Segment + Master + Media Playlist tags en un archivo ⇒ RFC 8216 §4.3.2 obliga al cliente a fallar | `EXTINF`×10.631 + `DATERANGE`×10.632 + `STREAM-INF`×10.631 + `I-FRAME`×10.631 + `TARGETDURATION`/`PART-INF`/`SERVER-CONTROL` | Decidir formato: catálogo M3U Plus **sin** tags HLS de master/media, o master/medias reales por canal. No añadir gramática nueva desde ARA-X |
| **F-02** | CRITICAL | S1 | **4K/PQ/L153 blanket** sobre 92,4 % de canales | 10.631 wire 4K vs 7.523 @720p + 2.300 @1080p (in-band); 9.778 con bitrate < 28 Mbps para 4K | Emitir `RESOLUTION`/`CODECS`/`VIDEO-RANGE` por canal con evidencia; 4K/8K sólo como presentación en tags APE/ARA inertes |
| **F-03** | HIGH | S10 | **Par cuenta/clave constante en el path** de las 10.631 URLs + CORS `*` | 1 valor distinto en cada segmento de 6 c; 10.631 streamId; `Access-Control-Allow-Origin: *` | No introducir la URL en `/sync` ni en ARA; valorar URLs firmadas en VPS; restringir CORS |
| **F-04** | HIGH | S2 | **LL-HLS declarado e inexistente** | 1 `SERVER-CONTROL`, 1 `PART-INF`, 0 `PART`; `PART-HOLD-BACK` 1× en vez de 3× | Quitar los 3 tags del catálogo; si LL-HLS, generarlo en la media playlist del canal |
| **F-05** | HIGH | S4 | **HDR contradictorio** (PQ en wire vs SDR/BT.1886 en todas las demás capas; DV P8 sin `dvcC`) | `VIDEO-RANGE=PQ` 10.631 · `X-Video-Range=SDR` 10.631 · `HDR-TRANSFER:BT1886` 10.631 · `DV-PROFILE:8` 10.631 | Una sola decisión de rango por canal, coherente entre wire y metadata; PQ sólo con evidencia |
| **F-06** | HIGH | S2 | **CMAF/LCEVC/AI-SR ficticios** (0 `EXT-X-MAP`, contenedor mpegts) | 10.631 `EXT-X-CMAF:*`; 0 `EXT-X-MAP`; `CODECS="…,"` malformado | No emitir CMAF sin `EXT-X-MAP`+`.m4s` reales (truth-guard del repo) |
| **F-07** | HIGH | S1 | **`#EXT-X-I-FRAME-STREAM-INF` sin `URI`** y copiado idéntico 10.631 veces | `BANDWIDTH=375000,CODECS="hvc1.2.4.L123.B0"`, 0 `URI`, 0 `RESOLUTION` | Eliminar, o generarlo por canal con URI/BANDWIDTH reales |
| **F-08** | MEDIUM | S4 | **MaxFALL > MaxCLL** (imposible) | `PEAK=100,AVG=1000` ×7.523; `PEAK=400,AVG=1000` ×2.300 | `AVG ≤ PEAK`; derivar de probe |
| **F-09** | MEDIUM | S1 | **Dos `#EXT-X-START` con offset contradictorio** | −3.0 (línea 7) y −14 (línea 57) | Un único `#EXT-X-START` |
| **F-10** | MEDIUM | S1 | **`VERSION:9` vs "RFC8216-STRICT PASS"** (RFC define 1–7) + validación autogenerada | `#EXT-X-VERSION:9`; footer `verdict=PASS` del mismo generador | Renombrar el claim o bajar a 7 si no se usan features 8/9; validación independiente |
| **F-11** | MEDIUM | S5/S7 | **Volumen de parseo**: 546 MB, 956,58 líneas/canal, 99,85 % metadata | `EXTHTTP` 73,9 MiB + `KODIPROP` 64,6 MiB + `EXTVLCOPT` 51,0 MiB | Recortar metadata o servir media playlists por canal; ARA-X debe seguir siendo ~1 KB |
| **F-12** | MEDIUM | S1 | **45 canales sin `#EXT-X-STREAM-INF`** en la lista servida, y el validador dice `errors=0` | ids 904505–904581, P4, 944 líneas, `si=0` | Restaurar variante o marcar el canal como "sin variante" explícitamente; contar como warning |
| **F-13** | MEDIUM | S1 | **Divergencia A/B no determinista**: APE 4K/8K corregido en tags pero no en wire; 30 tags rotan contenido | 8KFAKE 10.631→808; wire 4K sigue en 10.586; Δ 3.929.020 B en 34 tags | Fijar el artefacto por `sha256` en `/sync`; idempotencia sólo intra-generación |
| **F-14** | MEDIUM | S1 | **108 `tvg-name` duplicados** (id/URL únicos) | 10.523 nombres únicos / 10.631 | Deduplicar por huella de nombre o desambiguar |
| **F-15** | LOW | S1 | **1 colisión de SID** de idempotencia | 10.630 únicos / 10.631 (`13fb1f0c…`) | Corregir el generador de SID (1 % de unicidad no se cumple al 100 %) |
| **F-16** | LOW | S1 | **LAB DNA no verificable** | `#EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED` | Emitir el sha256 real del export LAB |
| **F-17** | LOW | S1 | **Catchup y logos inconsistentes** | `catchup` por canal en 355/10.631; `tvg-logo=""` en 319 | Alinear con la cabecera global o retirar la promesa |
| **F-18** | MEDIUM | S2/S7 | **Knobs 8K/120 Hz en cliente** sobre decoder 4K@60 | `adaptive-maxwidth=7680`, `maxheight=4320`, `vrr_max=120`, `minterpolate fps=120` ×10.631 | Capar a capacidad de decode (`3840x2160`, 60 Hz) |
| **F-19** | LOW | S6 | **HTTP incoherente**: `Accept-Ranges: bytes` no honrado; ETag = tamaño gz (162.701.751 B) vs 568.241.457 B servidos | `GET Range: bytes=0-0` → `200 chunked` | Servir sin gzip o documentar; no prometer rangos |
| **F-20** | MEDIUM | S1 | **FPS declarado triple y contradictorio** (≥1.186 canales) | `ape-fps` 25/50 · `EXTVLCOPT video-fps=60` · `STREAM-INF FRAME-RATE` 30/60 (8.709/1.922) · `X-Framerate` 30/60 (7.523/3.108) | Un solo FPS por canal, coherente en las 4 capas |

---

## 9. Lo que ya está bien (no romper)

| ID | Invariante | Evidencia |
|---|---|---|
| **P-01** | **Sin pérdida de canales**: 10.631 en A, 10.631 en B, mismo orden | 10.631/10.631 `tvg-id` en la misma posición |
| **P-02** | **Cero URLs duplicadas y cero `tvg-id` duplicados** | 10.631 únicos en ambos; 0 normalizadas |
| **P-03** | **Una URL por canal**: 0 bloques con 0 URLs, 0 con >1 | 10.631/10.631 en ambos |
| **P-04** | **`#EXT-X-STREAM-INF` adyacente a su URL** donde existe | 10.631 (A) · 10.586 (B), 0 malformados |
| **P-05** | **Cero headers tóxicos** en 10.631 `#EXTHTTP` | 0 `Range`/`If-None-Match`/`If-Modified-Since`/`TE`/`Priority`/`Upgrade-Insecure-Requests` |
| **P-06** | **`#EXTHTTP` JSON válido 10.631/10.631** | 0 fallos de parseo |
| **P-07** | **Anti-509**: 0 `#EXT-X-MEDIA` (ninguna) y 0 `#EXT-X-I-FRAME-STREAM-INF` con `URI=` | 0 y 0 |
| **P-08** | **Cero `#EXT-X-ARA-*`** y **cero wire 8K** | 0 y 0 (`7680x4320` = 0 en 1.140 MB) |
| **P-09** | **Codificación limpia**: UTF-8 sin BOM, LF puro, termina en `\n`, 0 CRLF | medido byte a byte |
| **P-10** | **DATERANGE IDs únicos** (10.632/10.632) | RFC §6.2.1 cumplido |

---

## 10. Limitaciones (honestas)

- **No se decodificó bitstream.** Todo lo dicho sobre resolución/codec real proviene de la **metadata in-band del propio archivo**
  (que es la que R2 usa como "verdad" y es coherente entre `EXT-X-CMAF`, `#EXTHTTP`, DATERANGE y `ape-*`). Un `ffprobe` por canal
  (10.631 probes) queda fuera de esta tarea.
- **No se validó reproducción.** No se abrió la lista en TiviMate/OTT/VLC/ExoPlayer; el juicio RFC es normativo, no observacional.
- **HTTP medido una vez** (cabeceras + un `Range`), no en ventana temporal.
- **El `#EXTHTTP` no se audita header por header** (203 nombres): sólo toxicidad, validez JSON, conteo y 8 valores clave.
- **Las 45 excepciones** se identifican por `tvg-id`/grupo/perfil; no se verificó su URL una a una contra el proveedor.
- **`#EXT-X-APE-8KFAKE` y `4KFALSE`** se tratan como inertes (RFC §6.3.1); su efecto real depende del parser propietario del APK,
  que no se inspeccionó aquí.
- **Valores sensibles**: no reproducidos. Cualquier verificación adicional requiere acceso autorizado del propietario.

---

## 11. Handoff a R2/R3/D3 (qué necesita ARA-X de este R1)

1. **El catálogo es M3U Plus, no HLS.** Cualquier capa nueva (bloque ARA-X) debe ser **metadata inerte** y **no añadir gramática
   HLS**. El bloque de 27 líneas del baseline V2 (~1 KB) es el orden de magnitud correcto; el problema no es su tamaño.
2. **La verdad 4K/8K vive en el `#EXT-X-STREAM-INF`, y hoy miente en 9.823 canales.** La política "4K/8K fake honesta" (D2/I5)
   debe **gatear el wire** (RESOLUTION/CODECS/VIDEO-RANGE por evidencia) y dejar la ambición 4K/8K en tags APE/ARA de presentación.
   R2 ya fijó la taxonomía; R1 aporta el conteo estructural que la activa (92,4 %).
3. **`#EXT-X-ARA-8K-MODE:PRESENTATION` es correcto y suficiente**: 0 declaraciones 8K en el wire ya se cumple; lo que hay que
   corregir son los knobs VLC 8K/120 (F-18).
4. **La lista servida cambia entre generaciones** (UA/SPOOF + timestamps). El `/sync` debe **fijar `sha256` del artefacto** y la
   idempotencia debe probarse **intra-generación**; comparar dos descargas distintas nunca dará byte-identidad.
5. **La asimetría `EXTINF == STREAM-INF`** ya se rompió en 45 canales (B). El validador ARA-X debería contar
   `channels_without_variant` como **warning explícito**, no como `errors=0`.
6. **No reutilizar URLs en `/sync` ni en ARA** (F-03): la URL ya transporta el par cuenta/clave.

---

## Anexo A · Evidencia cruda

| Fichero | Contenido |
|---|---|
| [`r1_evidence/local_full.json`](r1_evidence/local_full.json) | Agregado completo de la lista A (108 KB) |
| [`r1_evidence/cdn_full.json`](r1_evidence/cdn_full.json) | Agregado completo de la lista B (108 KB) |
| [`r1_evidence/probe_local.json`](r1_evidence/probe_local.json) · [`probe_cdn.json`](r1_evidence/probe_cdn.json) | CMAF/DATERANGE/SID/URLs/HDR |
| [`r1_evidence/probe2_local.json`](r1_evidence/probe2_local.json) · [`probe2_cdn.json`](r1_evidence/probe2_cdn.json) | I-FRAME/CMAF/HDR-METADATA/censo 8K |
| [`r1_evidence/compare.json`](r1_evidence/compare.json) | Comparación índice a índice A↔B |
| [`r1_evidence/xtab_local.json`](r1_evidence/xtab_local.json) · [`xtab_cdn.json`](r1_evidence/xtab_cdn.json) | Cross-tabs perfil × verdad declarada |

## Anexo B · Scripts (reutilizables, `node` sin dependencias)

| Script | Función |
|---|---|
| `r1_analyze.js` | Agregado estructural completo en una pasada (772 tags, placement, dedup, URLs, EXTHTTP) |
| `r1_probe.js` | CMAF/8K/DATERANGE/SID/HDR/forma de URL |
| `r1_probe2.js` | I-FRAME, línea CMAF, HDR-METADATA, censo 8K, atributos EXTINF |
| `r1_fingerprint.js` | Huella por canal (JSONL) para comparar dos catálogos |
| `r1_compare.js` | Diferencia índice a índice + conjuntos |
| `r1_crosstab.js` | Perfil × resolución/codec/bitrate/fps/headers |
| `r1_digest.js` | Resumen legible de un `*.json` de `r1_analyze.js` |
| `r1_sample.js` | Muestra cabecera/bloques con URLs enmascaradas |
| `r1_selfcheck.js` | **Autoverificación**: 102 aserciones aritméticas contra la evidencia cruda |

## Anexo C · Autoverificación aritmética

```powershell
node ara-x/scripts/forensics/r1_selfcheck.js
# checks=102 pass=102 fail=0
# ALL_OK
```

El autocheck cruza `R1_findings.json` contra `r1_evidence/*.json` y el `compare.json`, y verifica entre otras:

- `sha256` y bytes de ambos artefactos contra `Get-FileHash` (A `E27C03EB…E2A680`, B `81DBDD11…BE14E`).
- Sumas de perfil (`808+2.300+7.523 = 10.631`), `truthful_4k + declared_4k = 10.631`, `9.823/10.631 = 92,4 %`.
- `BANDWIDTH` (`8.021+1.757+853 = 10.631` · B: `8.021+1.757+808 = 10.586 = 10.631 − 45`).
- `4KFALSE = 4 × 10.631`, `8KFAKE` A = 10.631 / B = 808, `4K-PREMIUM` B = 808.
- `codec-family` (`9.593 + 1.038`), `ape-fps`, `catchup 355`, `logo vacío 319`.
- `EXTHTTP` (10.631/10.631 válidos; suma de la distribución 193/203 = 10.631).
- Bytes de URL (873.274 B idénticos en A y B) y % metadata (99,85 / 99,84).
- Delta contable: `byte_delta_accounted.sum = 3.929.020 = bytes(A) − bytes(B)` y `line_delta_accounted.sum = −30.322 = líneas(B) − líneas(A)`.
- Comparación índice a índice: 10.631 URLs/`tvg-id`/perfil/resolución in-band idénticos; 45/9.823/10.631 discrepancias donde corresponde.
- `findings = 20` con IDs únicos y severidades válidas; **0 literales de credencial** en el JSON publicado.

