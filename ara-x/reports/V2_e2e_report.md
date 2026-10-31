# V2 · E2E sobre el catálogo real — inyección ARA-X, 0 pérdida, 0 URL mutada, idempotencia

**Fecha:** 2026-10-30T19:31:04.994-05:00  
**Host:** win32/x64 10.0.26200 · Node v24.12.0 · sin red, sin VPS, sin deploy  
**Veredicto: PASS** · 2/2 listas · 809336 ms de pipeline · 0 checks rojos.

> Identidad (R1 §0.8 / D3 `artifact`): `artifact_sha256` = sha256 de la captura de entrada; `generation_id` identifica ESTA generación (artefacto + versión ARA-X + list_version + bloque). La byte-identidad se afirma **solo intra-generación** (`once` vs `twice` con los mismos parámetros). Entre generaciones **no** se afirma: cambiar `list_version` cambia el bloque por diseño.

## Generación

| Parámetro | Valor |
|---|---|
| schema | `ara-x.playlist.generation/1` |
| ARA_VERSION | `2026.10.30-EVO-NODROP` |
| LIST_VERSION (D1) | `2026-10-30T22:07:37Z` |
| bloque ARA-X | 27 líneas · sha256 `54a08b9550b849b8…` |
| per_channel | false |
| sync_url / client_type | `https://iptv-ape.duckdns.org/sync` · `onn4k` |

## 4K_LOCAL_FULL — APE_LISTA_4K (captura local full)

**Resultado: PASS** · 422027 ms.

### Entrada y salidas (hashes)

| Rol | Archivo | Bytes | sha256 |
|---|---|---|---|
| input (artifact) | `ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8` | 572170477 | `e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680` |
| output once | `ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8` | 572171381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| output twice | `ara-x/evidence/APE_LISTA_4K_ARA-X_twice.m3u8` | 572171381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| segunda pasada (temp) | `4K_LOCAL_FULL.twice` | 572171381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |

- `artifact_sha256`: `e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680`
- `generation_id`: `ara-x.gen1:dfe8a76ede5068f722b9d88e83fc7759`
- `source_identity`: list-id `APE_LAB_9zdfpzfc8hog` · generated `2026-10-29T10:49:32.032Z` · APE_v8.0-LAB

### Conteos antes/después

| Métrica | Antes | Después | ¿Igual? |
|---|---|---|---|
| extinf | 10631 | 10631 | sí |
| urls | 10631 | 10631 | sí |
| streamInf | 10631 | 10631 | sí |
| extattr | 584705 | 584705 | sí |
| declaredChannels | 10631 | 10631 | sí |
| blocks | 10631 | 10631 | sí |
| blocksWithWrongUrlCount | 0 | 0 | sí |
| channelsWithoutStreamInf | 0 | 0 | sí |
| #EXT-X-ARA-* (bloque) | 0 | 27 (global 27, canal 0) | +27 |

- Truncamiento: `EXTINF (10631) == #EXT-X-APE-CHANNELS (10631)` ⇒ captura completa.
- Sin bloques sin URL: `blocksWithWrongUrlCount=0` sobre 10631 canales.
- Bloque ARA/Never-Drop único: araVersion=1, 27 líneas globales, 0 por canal; `#EXT-X-ARA-MODE:never-drop` presente una vez.

### Integridad de URLs (0 mutación)

| Check | Valor |
|---|---|
| URLs antes / después | 10631 / 10631 |
| sha256 por URL (posiciones distintas) | 0 |
| digest de la lista de sha256 por URL (antes) | `15fb5ef3d3b56e4caa7162f59b23a4be1c90fd969f2982f1a62744768fd58f19` |
| digest de la lista de sha256 por URL (después) | `15fb5ef3d3b56e4caa7162f59b23a4be1c90fd969f2982f1a62744768fd58f19` |
| sha256 agregado del validator (antes) | `f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330` |
| sha256 agregado del validator (después) | `f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330` |
| muestras enmascaradas | `https://iptv-ape.duckdns.org/…P/3.m3u8` · `https://iptv-ape.duckdns.org/…P/5.m3u8` · `https://iptv-ape.duckdns.org/…P/6.m3u8` |

### Idempotencia

- 2.ª pasada: `injected=false`, `reason=already_present`.
- sha256 once = `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07`
- sha256 twice = `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07`
- byte-idéntica intra-generación: **sí** (572171381 B).

### Comparación entre generaciones (informativa, NO byte-identidad)

- Referencia (I2, otro `list_version`): `ara-x/evidence/APE_LISTA_4K_live_20261030_full_ARA-X_once.m3u8` · `24e1e3f6babb8c6df82a3de25616423d78aa608881407063ddcd277a4ddc951d`
- V2: `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` · 572171381 B · referencia 572171381 B
- bytes iguales: true · líneas comparadas: 10169589 · líneas distintas: **1**
  - L155: `#EXT-X-ARA-LIST-VERSION:2026-10-30T22:07:37Z` ↔ `#EXT-X-ARA-LIST-VERSION:2026-10-29T11:54:23Z`
- La byte-identidad NO se afirma entre generaciones (R1 §0.8: solo intra-generación). La referencia I2 se generó con otro list_version; se comprueba que el resto del archivo es idéntico.

### Hallazgos PRE-EXISTENTES (R1) — reportados, no “arreglados” por esta capa

| Código | Conteo | Descripción |
|---|---|---|
| `grammar_mixed_master_media` | 3 | el catálogo mezcla Master tags y Media Playlist tags (RFC 8216 §4.3.2) |
| `grammar_mixed_segment_master` | 21263 | el catálogo mezcla Media Segment tags (#EXTINF/#EXT-X-DATERANGE) y Master tags |
| `iframe_without_uri` | 10631 | #EXT-X-I-FRAME-STREAM-INF sin atributo URI (RFC 8216 §4.3.4.3) |
| `ext_x_start_duplicated` | 1 | más de un EXT-X-START (arranque ambiguo) |
| `cmaf_malformed_codecs` | 10631 | CODECS con elemento vacío (coma final) en #EXT-X-CMAF |
| `hdr_maxfall_gt_maxcll` | 9823 | MaxFALL (AVG) > MaxCLL (PEAK): metadata HDR físicamente imposible |
| `tvg_name_duplicate` | 108 | tvg-name duplicado con tvg-id/URL distintos |
| `sid_collision` | 1 | colisión de SID en #EXT-X-CMAF-IDEMPOTENCIA |
| `extinf_non_rfc_duration` | 10631 | EXTINF con duración no decimal (convención M3U Plus, no RFC 8216) |

> El footer del propio generador (`#EXT-X-APE-VALIDATED:…errors=0…`) **no es prueba de completitud**: no considera “canal sin variante” un error. La simetría 1:1 `EXTINF == STREAM-INF` se mide aquí aparte (medido: 10631 EXTINF / 10631 STREAM-INF ⇒ 0 canales sin variante; la URL existe ⇒ no es pérdida de canal).

### Checks

| Check | Estado | Detalle |
|---|---|---|
| file_present | PASS | "APE_LISTA_4K_live_20261030_full.m3u8" |
| input_sha256_hex64 | PASS | "e27c03eb45dacd6e…" |
| input_known_artifact | PASS | {"expected":"e27c03eb45dacd6e…","got":"e27c03eb45dacd6e…"} |
| input_extinf_expected | PASS | {"expect":10631,"got":10631} |
| input_urls_expected | PASS | {"expect":10631,"got":10631} |
| input_streaminf_expected | PASS | {"expect":10631,"got":10631} |
| input_extattr_expected | PASS | {"expect":584705,"got":584705} |
| input_declared_channels_expected | PASS | {"expect":10631,"got":10631} |
| input_channels_without_streaminf_expected | PASS | {"expect":0,"got":0} |
| input_extinf_equals_ape_channels | PASS | {"extinf":10631,"ape_channels":10631} |
| input_capture_complete | PASS | {"declared":10631,"measured":10631} |
| input_no_ara_block | PASS | {"validator_araTags":0,"scan_araTags":0} |
| injected | PASS | "injected" |
| block_lines_27 | PASS | 27 |
| eol_preserved | PASS | {"input_crlf_lines":0,"inject_eol":"LF"} |
| validator_ok | PASS | [] |
| validator_no_errors | PASS | 0 |
| channels_preserved | PASS | {"before":10631,"after":10631} |
| urls_preserved | PASS | {"before":10631,"after":10631} |
| streaminf_preserved | PASS | {"before":10631,"after":10631} |
| extattr_preserved | PASS | {"before":584705,"after":584705} |
| declared_channels_preserved | PASS | {"before":10631,"after":10631} |
| extinf_equals_ape_channels_after | PASS | {"extinf":10631,"ape_channels":10631} |
| capture_complete_after | PASS | {"declared":10631,"measured":10631} |
| zero_wrong_url_blocks_after | PASS | {"blocks":10631,"wrong":0,"samples":[]} |
| ara_block_exactly_once | PASS | {"araVersion":1,"araTags":27,"araVersionLines":1,"expectedTags":27,"duplicates":[]} |
| ara_never_drop_unique | PASS | {"neverDropLines":1,"araTags":27} |
| ara_placement_clean | PASS | {"blockBeforeFirstExtinf":true,"contiguous":true,"misplaced":0,"unknown":0,"badValue":0,"forbidden":0,"channelLines":0} |
| compare_ok | PASS | [] |
| per_url_sha256_equal | PASS | {"before":10631,"after":10631,"mismatches":0} |
| url_perurl_digest_equal | PASS | {"before":"15fb5ef3d3b56e4c…","after":"15fb5ef3d3b56e4c…"} |
| url_aggregate_sha_equal | PASS | {"before":"f69a048f8c4c14a8…","after":"f69a048f8c4c14a8…"} |
| preexisting_reported | PASS | {"codes":9} |
| r1_channels_without_streaminf_match | PASS | {"expect":0,"got":0} |
| second_pass_noop | PASS | "already_present" |
| second_pass_byte_identical | PASS | {"once":"c8b5039ed8624b3d…","twice":"c8b5039ed8624b3d…"} |
| output_once_published | PASS | {"file":"ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8","bytes":572171381,"sha256":"c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07"} |
| output_twice_published | PASS | {"file":"ara-x/evidence/APE_LISTA_4K_ARA-X_twice.m3u8","bytes":572171381,"sha256":"c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07"} |
| generation_metadata_valid | PASS | {"artifact_sha256":"e27c03eb45dacd6e…","generation_id":"ara-x.gen1:dfe8a76ede5068f722b9d88e83fc7759"} |

## CDN_FULL — APE_LISTA_CDN_1793397700248 (full)

**Resultado: PASS** · 387309 ms.

### Entrada y salidas (hashes)

| Rol | Archivo | Bytes | sha256 |
|---|---|---|---|
| input (artifact) | `ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8` | 568241457 | `81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e` |
| output once | `ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_once.m3u8` | 568242361 | `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda` |
| output twice | `ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_twice.m3u8` | 568242361 | `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda` |
| segunda pasada (temp) | `CDN_FULL.twice` | 568242361 | `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda` |

- `artifact_sha256`: `81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e`
- `generation_id`: `ara-x.gen1:adf46af40f32b7720f887fb81abf891b`
- `source_identity`: list-id `APE_LAB_g2pph2csp4oi` · generated `2026-10-30T22:01:59.538Z` · APE_v8.0-LAB

### Conteos antes/después

| Métrica | Antes | Después | ¿Igual? |
|---|---|---|---|
| extinf | 10631 | 10631 | sí |
| urls | 10631 | 10631 | sí |
| streamInf | 10586 | 10586 | sí |
| extattr | 574074 | 574074 | sí |
| declaredChannels | 10631 | 10631 | sí |
| blocks | 10631 | 10631 | sí |
| blocksWithWrongUrlCount | 0 | 0 | sí |
| channelsWithoutStreamInf | 45 | 45 | sí |
| #EXT-X-ARA-* (bloque) | 0 | 27 (global 27, canal 0) | +27 |

- Truncamiento: `EXTINF (10631) == #EXT-X-APE-CHANNELS (10631)` ⇒ captura completa.
- Sin bloques sin URL: `blocksWithWrongUrlCount=0` sobre 10631 canales.
- Bloque ARA/Never-Drop único: araVersion=1, 27 líneas globales, 0 por canal; `#EXT-X-ARA-MODE:never-drop` presente una vez.

### Integridad de URLs (0 mutación)

| Check | Valor |
|---|---|
| URLs antes / después | 10631 / 10631 |
| sha256 por URL (posiciones distintas) | 0 |
| digest de la lista de sha256 por URL (antes) | `15fb5ef3d3b56e4caa7162f59b23a4be1c90fd969f2982f1a62744768fd58f19` |
| digest de la lista de sha256 por URL (después) | `15fb5ef3d3b56e4caa7162f59b23a4be1c90fd969f2982f1a62744768fd58f19` |
| sha256 agregado del validator (antes) | `f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330` |
| sha256 agregado del validator (después) | `f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330` |
| muestras enmascaradas | `https://iptv-ape.duckdns.org/…P/3.m3u8` · `https://iptv-ape.duckdns.org/…P/5.m3u8` · `https://iptv-ape.duckdns.org/…P/6.m3u8` |

### Idempotencia

- 2.ª pasada: `injected=false`, `reason=already_present`.
- sha256 once = `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda`
- sha256 twice = `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda`
- byte-idéntica intra-generación: **sí** (568242361 B).

### Hallazgos PRE-EXISTENTES (R1) — reportados, no “arreglados” por esta capa

| Código | Conteo | Descripción |
|---|---|---|
| `grammar_mixed_master_media` | 3 | el catálogo mezcla Master tags y Media Playlist tags (RFC 8216 §4.3.2) |
| `grammar_mixed_segment_master` | 21263 | el catálogo mezcla Media Segment tags (#EXTINF/#EXT-X-DATERANGE) y Master tags |
| `iframe_without_uri` | 10631 | #EXT-X-I-FRAME-STREAM-INF sin atributo URI (RFC 8216 §4.3.4.3) |
| `ext_x_start_duplicated` | 1 | más de un EXT-X-START (arranque ambiguo) |
| `cmaf_malformed_codecs` | 10631 | CODECS con elemento vacío (coma final) en #EXT-X-CMAF |
| `hdr_maxfall_gt_maxcll` | 9823 | MaxFALL (AVG) > MaxCLL (PEAK): metadata HDR físicamente imposible |
| `channel_without_stream_inf` | 45 | canales sin #EXT-X-STREAM-INF (no son pérdida de canal: la URL existe) |
| `tvg_name_duplicate` | 108 | tvg-name duplicado con tvg-id/URL distintos |
| `sid_collision` | 1 | colisión de SID en #EXT-X-CMAF-IDEMPOTENCIA |
| `extinf_non_rfc_duration` | 10631 | EXTINF con duración no decimal (convención M3U Plus, no RFC 8216) |

> El footer del propio generador (`#EXT-X-APE-VALIDATED:…errors=0…`) **no es prueba de completitud**: no considera “canal sin variante” un error. La simetría 1:1 `EXTINF == STREAM-INF` se mide aquí aparte (medido: 10631 EXTINF / 10586 STREAM-INF ⇒ 45 canales sin variante; la URL existe ⇒ no es pérdida de canal).

### Checks

| Check | Estado | Detalle |
|---|---|---|
| file_present | PASS | "APE_LISTA_CDN_1793397700248_full.m3u8" |
| input_sha256_hex64 | PASS | "81dbdd11ec620b1d…" |
| input_known_artifact | PASS | {"expected":"81dbdd11ec620b1d…","got":"81dbdd11ec620b1d…"} |
| input_extinf_expected | PASS | {"expect":10631,"got":10631} |
| input_urls_expected | PASS | {"expect":10631,"got":10631} |
| input_streaminf_expected | PASS | {"expect":10586,"got":10586} |
| input_extattr_expected | PASS | {"got":574074} |
| input_declared_channels_expected | PASS | {"expect":10631,"got":10631} |
| input_channels_without_streaminf_expected | PASS | {"expect":45,"got":45} |
| input_extinf_equals_ape_channels | PASS | {"extinf":10631,"ape_channels":10631} |
| input_capture_complete | PASS | {"declared":10631,"measured":10631} |
| input_no_ara_block | PASS | {"validator_araTags":0,"scan_araTags":0} |
| injected | PASS | "injected" |
| block_lines_27 | PASS | 27 |
| eol_preserved | PASS | {"input_crlf_lines":0,"inject_eol":"LF"} |
| validator_ok | PASS | [] |
| validator_no_errors | PASS | 0 |
| channels_preserved | PASS | {"before":10631,"after":10631} |
| urls_preserved | PASS | {"before":10631,"after":10631} |
| streaminf_preserved | PASS | {"before":10586,"after":10586} |
| extattr_preserved | PASS | {"before":574074,"after":574074} |
| declared_channels_preserved | PASS | {"before":10631,"after":10631} |
| extinf_equals_ape_channels_after | PASS | {"extinf":10631,"ape_channels":10631} |
| capture_complete_after | PASS | {"declared":10631,"measured":10631} |
| zero_wrong_url_blocks_after | PASS | {"blocks":10631,"wrong":0,"samples":[]} |
| ara_block_exactly_once | PASS | {"araVersion":1,"araTags":27,"araVersionLines":1,"expectedTags":27,"duplicates":[]} |
| ara_never_drop_unique | PASS | {"neverDropLines":1,"araTags":27} |
| ara_placement_clean | PASS | {"blockBeforeFirstExtinf":true,"contiguous":true,"misplaced":0,"unknown":0,"badValue":0,"forbidden":0,"channelLines":0} |
| compare_ok | PASS | [] |
| per_url_sha256_equal | PASS | {"before":10631,"after":10631,"mismatches":0} |
| url_perurl_digest_equal | PASS | {"before":"15fb5ef3d3b56e4c…","after":"15fb5ef3d3b56e4c…"} |
| url_aggregate_sha_equal | PASS | {"before":"f69a048f8c4c14a8…","after":"f69a048f8c4c14a8…"} |
| preexisting_reported | PASS | {"codes":10} |
| r1_channels_without_streaminf_match | PASS | {"expect":45,"got":45} |
| second_pass_noop | PASS | "already_present" |
| second_pass_byte_identical | PASS | {"once":"c32722c8afc33949…","twice":"c32722c8afc33949…"} |
| output_once_published | PASS | {"file":"ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_once.m3u8","bytes":568242361,"sha256":"c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda"} |
| output_twice_published | PASS | {"file":"ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_twice.m3u8","bytes":568242361,"sha256":"c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda"} |
| generation_metadata_valid | PASS | {"artifact_sha256":"81dbdd11ec620b1d…","generation_id":"ara-x.gen1:adf46af40f32b7720f887fb81abf891b"} |

## Ejecuciones

- `2026-10-30T19:17:49.560-05:00` · 4K_LOCAL_FULL, CDN_FULL · PASS · 707531 ms
- `2026-10-30T19:31:04.994-05:00` · 4K_LOCAL_FULL, CDN_FULL · PASS · 809385 ms

## Reproducir

```powershell
node ara-x/scripts/e2e/run_e2e.js --selftest       # sintético, no toca evidence/
node ara-x/scripts/e2e/run_e2e.js --list 4K        # captura 4K full (572 MB)
node ara-x/scripts/e2e/run_e2e.js --list CDN       # captura CDN full (568 MB)
node ara-x/scripts/e2e/run_e2e.js --list all       # ambos (≈10 min, 2,3 GB de I/O)
node --test "ara-x/tests/*.test.js"                # forma ejecutable de la suite (Node 24/Windows)
node --check ara-x/scripts/e2e/run_e2e.js
```

Salidas: `ara-x/evidence/APE_LISTA_4K_ARA-X_{once,twice}.m3u8` y `ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_{once,twice}.m3u8`. Los nombres del 4K son los que fija el scope de t20 y **no** incluyen `_full`; su `artifact_sha256` identifica la captura full de la que provienen (tabla de hashes arriba).

## Límites

- Solo lectura local de las capturas de `ara-x/evidence/`; no hay red, VPS ni deploy.
- `#EXT-X-APE-CHANNELS` ya viene en la cabecera del catálogo: V2 comprueba EXTINF == ese valor (truncamiento) antes y después; no lo reescribe.
- El footer `#EXT-X-APE-VALIDATED … errors=0` es del validador del generador y NO se usa como prueba; los conteos y los hallazgos pre-existentes se miden aquí con `ara_x_validator`.
- Byte-identidad: solo intra-generación (once vs twice). Cambiar `list_version` (u otro parámetro del bloque) produce otro archivo por diseño; la comparación con la generación previa de I2 se reporta como informativa, no como PASS de estabilidad entre generaciones.
- Los nombres de salida del 4K (`APE_LISTA_4K_ARA-X_*`) son los fijados por el scope de t20 y no incluyen `_full`; el `artifact_sha256` de la tabla identifica la captura full de origen.
- Salidas publicadas en `ara-x/evidence/`.
- Reporte con las dos capturas completas.
- La forma `node --test ara-x/tests/` no es ejecutable en Node 24.12.0/Windows (el runner trata el directorio como módulo); la suite se ejecuta con el glob `node --test "ara-x/tests/*.test.js"`, que cubre los mismos archivos.
- Reporte reconstruido desde V2_e2e.json: solo se normalizó el formato de timestamps de run_history/generated_at (una versión previa de stamp() rotulaba la hora UTC con el offset local). No se re-ejecutó el E2E ni se alteró ningún dato de listas, hashes o checks.

**Firma V2:** `integration-verifier` · 2026-10-30T19:31:04.994-05:00 · `PASS`.
