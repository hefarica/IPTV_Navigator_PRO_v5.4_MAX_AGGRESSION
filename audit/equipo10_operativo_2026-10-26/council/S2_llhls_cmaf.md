# S2 — Council LL-HLS / CMAF-fMP4: lo declarado vs lo implementado

**Fase:** Council read-only · **Fecha:** 2026-10-26 · **Autor:** s2-llhls-cmaf (agente, no persona)
**Snapshot citado:** git HEAD `e38a89b` (todos los conteos son `git grep` **contra el árbol `e38a89b`**, no contra el disco).
**Aviso de snapshot:** el working tree **no** coincide con `e38a89b` (S1 F01: `m3u8-typed-arrays-ultimate.js` +10 447/−10). Donde cito ese archivo uso líneas de **HEAD**; el disco tiene el bloque duplicado (2627-2628 y 12934-12935 en working tree → 2694-2695 en HEAD).
**Abreviaturas:** `P/` = `IPTV_v5.4_MAX_AGGRESSION/` · `V/` = `_vps_stage/` · `REL/` = `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` (medición 2026-10-26T03:55–04:00Z)
**Método:** conteo literal por archivo (`git grep -o -F`), lectura de emisores y de la cadena de ejecución del plano de metadata. **No** se ejecutó generador, ffmpeg, Lua ni se contactó VPS/proveedor (Council read-only). Sin red ⇒ todo probe de red es NOT_RUN.
**Clasificación de zonas:** `CODE` = código/fixtures; `DECL` = `.md` + `.agents/` + `.claude/` + `docs/` + `audit/` (declarativo, no ejecuta nada).

---

## 1. Veredicto por afirmación

| # | Afirmación evaluada | Veredicto |
|---|---|---|
| A1 | Existe LL-HLS **real** (partes parciales servidas) en la arquitectura desplegada | **FAIL** |
| A2 | La lista servida **no** declara LL-HLS que no puede entregar | **FAIL** |
| A3 | `CAN-BLOCK-RELOAD=YES` tiene implementación de *blocking reload* en servidor | **FAIL** |
| A4 | `EXT-X-PRELOAD-HINT:TYPE=PART` apunta a una parte real | **FAIL** |
| A5 | Regla honesta CMAF se respeta en la **capa de decisión** (`fmp4-cmaf` solo con MAP + `.m4s`/`init.mp4`) | **PASS** |
| A6 | Regla honesta CMAF se respeta en los **emisores** PHP/JS | **FAIL** (2 emisores: §2 F09 y F10) |
| A7 | El único fixture LL-HLS versionado está alineado (`PART-TARGET` / `EXTINF` / `TARGETDURATION`) | **PASS** |
| A8 | Estructura fMP4 real (`ftyp`/`moov`/`moof`/`mdat`) verificada en bytes | **NOT_RUN** (no hay ni un `.m4s`/`.mp4` en el árbol) |
| A9 | Alineación `TARGETDURATION` vs segmentos en **producción** | **NOT_RUN** (no existe media playlist real; el artefacto servido es catálogo M3U Plus) |
| A10 | La inyección de `EXT-X-SERVER-CONTROL` del VPS está **medida en el VPS** | **BLOCKED** (sin SSH/red por contrato; sólo evidencia de tercero) |
| A11 | Conteo real de ocurrencias por archivo (no estimación) | **PASS** (§2 F01) |
| A12 | La superficie LL-HLS en JS es de **consumo** (parsers/prober), no de emisión | **PASS** |

**Totales: PASS 4 · FAIL 5 · BLOCKED 1 · NOT_RUN 2** (12 afirmaciones, 24 hechos en §2)

---

## 2. Hechos con fuente

### 2.1 Conteo por archivo (no estimado) — `git grep -o -I -F -n -e '<tag>' e38a89b -- .`

| tag | matches | archivos | CODE | DECL |
|---|---|---|---|---|
| `EXT-X-PART` (substring) | 195 | 98 | 81 | 114 |
| `#EXT-X-PART:` (**literal**, sólo esto emite una parte) | **26** | 15 | **10** | 16 |
| `EXT-X-PART-INF` | 106 | 63 | 46 | 60 |
| `EXT-X-SERVER-CONTROL` | 165 | 102 | 68 | 97 |
| `EXT-X-PRELOAD-HINT` | 63 | 44 | 31 | 32 |
| `EXT-X-RENDITION-REPORT` | 23 | 11 | 19 | 4 |
| `CAN-BLOCK-RELOAD` | 152 | 83 | 47 | 105 |
| `_HLS_msn` | 19 | 12 | **1** | 18 |
| `_HLS_part` | 16 | 10 | **1** | 15 |
| `EXT-X-MAP` | 303 | 126 | 85 | 218 |
| `.m4s` | 372 | 156 | 167 | 205 |
| `init.mp4` | 261 | 97 | 95 | 166 |

Los 10 `CODE` con `#EXT-X-PART:` literal son: `V/fixtures/selftest_ll.m3u8` (4, dato), `V/scripts/smoke.sh` (1, `grep`), `V/lua/ape_session.lua` (1, string de test), `V/lua/ape_luatest.lua` (1, string de test), `P/frontend/js/ape-v9/parsers/ape-hls-media-parser.js` (1, regex), `P/frontend/js/ape-v9/parsers/ape-llhls-parser.js` (1, regex), `P/frontend/js/vendor/m3u8-parser.vendor.js` (1). **Cero emisores de producción.**

### 2.2 Hechos

| ID | Hecho observado | Fuente (archivo:línea o comando+exit) | Veredicto |
|---|---|---|---|
| F01 | Ningún emisor de producción escribe `#EXT-X-PART:`; los únicos literales viven en fixtures/tests/parsers | tabla §2.1 (12 tags × `git grep`, exit 0) | **FAIL** (A1) |
| F02 | El plano que sí sirve el VPS **bloquea el vídeo por diseño**: `.ts|.m4s|.mp4|…` → `return 404` | `V/nginx/meta-plane.conf:224-230`; corrobora `REL/:58` (E3 «los segmentos responden 404») y `REL/:22` (rebase-only) | **FAIL** (A1) |
| F03 | **La lista servida sí declara LL-HLS**: `#EXT-X-PART-INF:PART-TARGET=1.0` y `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=3.0` en el header global | censo de la lista vigente por tercero: `audit/alignment/2026-10-25/50-listas/tools/_raw_census_vigente.txt:97,99` y `LISTS_RFC8216_AUDIT.md:66,68` (medición ajena, no re-ejecutada) | **FAIL** (A2) |
| F04 | El emisor de esas dos líneas existe y es determinista: SSOT JSON + PHP | `P/vps/prisma/config/m3u8_directives_config.json:15-16,27-28` (valores idénticos byte a byte a F03) → `P/vps/ape_hls_generators.php:188-190` (`generate_ape_global_header`), y variante Lua `P/vps/nginx/lua/lab_config.lua:114-116` | **FAIL** (A2) |
| F05 | El generador frontend emite el mismo bloque en modo `maxQualityMode`, con `PART-HOLD-BACK=0.5` para `PART-TARGET=0.5` (**1×**, no 3×) | HEAD `P/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:2694-2695` (guard `if (options && options.maxQualityMode)` en `:2687`) | **FAIL** (A2) |
| F06 | Existe un **segundo generador homónimo** `P/scripts/m3u8-typed-arrays-ultimate.js` (v16.0.0, **2 507** líneas, ≠ el frontend de **10 417**) que emite el bloque con otra aritmética (`PART-TARGET=segDur/6`, `PART-HOLD-BACK=3×segDur`, `CAN-SKIP-UNTIL=segDur`) **y además** `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="preload-next.m3u8"` → un **playlist** declarado como parte preloadable. Su cabecera proclama «COMPLIANCE: RFC 8216 100%» | HEAD `P/scripts/m3u8-typed-arrays-ultimate.js:1646-1648`; cabecera `:1-10`; `git show … \| Measure-Object -Line` → 2507 vs 10417 | **FAIL** (A2, A4) |
| F07 | `CAN-BLOCK-RELOAD=YES` no tiene contraparte servidor: `_HLS_msn`/`_HLS_part` aparecen **1 vez cada uno en CODE**, y es el bundle **cliente** hls.js | `P/frontend/js/vendor/hls.light.vendor.js` (único CODE con ambos); 0 en `*.lua`/`*.php`/`*.py`/`*.js` de servidor | **FAIL** (A3) |
| F08 | El gateway público inyecta `CAN-BLOCK-RELOAD=YES` a fuentes que ya traen partes | `V/lua/ape_gateway.lua:209-213` → `V/lua/ape_rebase_lib.lua:76-87`; ruta publicada `/cdn/` = `content_by_lua_file ape_gateway.lua` en `V/nginx/meta-plane.conf:182-183` | **FAIL** (A3) |
| F09 | Emisor PHP de fMP4 emite `#EXT-X-MAP` **incondicional**, incluso sin un solo `seg_*.m4s` | `P/backend/cmaf_engine/modules/dual_manifest_generator.php:189` (MAP) vs `:192-196` (si `glob()` vacío sólo escribe un comentario) | **FAIL** (A6) |
| F10 | Emisor PHP «repara» inyectando `CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5` sin comprobar partes ni `PART-TARGET` | `P/backend/cmaf_engine/modules/manifest_repair_engine.php:390-410` (literal en `:404`, `action => ADD_LL_HLS_HINT` en `:406`); replicado en 4 copias + plantilla de skill `.agent/skills/…/modules/manifest_repair_engine.php` | **FAIL** (A3/A6) |
| F11 | La capa de **decisión** sí es honesta: `fmp4-cmaf` sólo si `EXT-X-MAP` **y** (`.m4s` **o** `init.mp4`) | `P/frontend/js/ape-v9/ape-quality-prober.js:162-170` (línea 167); `P/frontend/js/ape-v9/ape-fallback-resolver.js:129-132` marca contradicción si el claim no tiene MAP | **PASS** (A5) |
| F12 | **Nadie emite `ape-container=fmp4-cmaf`**: 0 emisiones en código; las 5 apariciones son doctrina (`CLAUDE.md:199`, `docs/manifestos/ape-vps-hevc-crystal-integrator/references/{truth_guards.md:57,web_authority.md:69}`) y la whitelist del parser (`P/frontend/js/ape-v9/parsers/ape-custom-tags-parser.js:6,22`) | `grep 'ape-container'` → 5 matches, ninguna concatenación a playlist | **PASS** (A5, regla no violada *porque no se emite*) |
| F13 | Donde el MAP rompió un player real, el repo **retiró el tag** en vez de mentir: `serve_cmaf_m3u8_fallback` documenta «`#EXT-X-MAP` retirado en T11/B-11 … declararlo producía un fallo de init en ExoPlayer» | `P/vps/ape_hls_generators.php:627-628` | **PASS** (contraejemplo de la regla aplicada) |
| F14 | Fixture LL alineado: `TARGETDURATION:2`; `EXTINF:2.000` (=2 ≤ 2); 4×`DURATION=0.500`=2.000 (= EXTINF); `PART-TARGET=0.500` = duración de cada parte | `V/fixtures/selftest_ll.m3u8:3,4,6,7-10` (aritmética verificable a mano) | **PASS** (A7) |
| F15 | Ese fixture declara `EXT-X-MAP:URI="init.mp4"`… y **no existe `init.mp4`** en el repo ni en el disco | `V/fixtures/selftest_ll.m3u8:5`; `git ls-tree -r --name-only e38a89b \| Where-Object { $_ -match '\.(m4s\|mp4\|cmfv\|cmfa)$' }` → **0 líneas**; `Get-ChildItem -Recurse -File -Include *.m4s,init.mp4` (sin `.git`) → **NONE** | **NOT_RUN** (A8) |
| F16 | El otro fixture con `EXT-X-MAP` es un **master** con `EXT-X-MAP` + `EXTINF` + segmento `.ts`: mezcla de tipos, inservible como evidencia CMAF | `V/fixtures/selftest.m3u8:3-8` | **NOT_RUN** (no apto como prueba) |
| F17 | El único sitio que **realmente empaquetaría** fMP4 (init + `seg_*.m4s` desde ffmpeg) es un motor PHP que no está desplegado | `P/backend/cmaf_engine/modules/cmaf_packaging_engine.php:51,153,166,410-412` (`/usr/bin/ffmpeg`, `proc_open`); `REL/:112,118` (el `cmaf_engine`/Grupo B no está desplegado; 8/13 artefactos ni existen) | **FAIL** (A1) |
| F18 | `ape-llhls-analyzer.js` (alcance explícito de S2) es **consumidor**: instancia hls.js headless y lee `details.partList/partTarget/preloadHint`; no emite ni una línea de playlist | `P/frontend/js/ape-v9/ape-llhls-analyzer.js:38-224` (extracción en `:147-195`), export `:307-315` | **PASS** (A12) |
| F19 | Doc vs código en ese analyzer: el encabezado declara «Timeout: 8 segundos», la constante real es 4000 ms | `P/frontend/js/ape-v9/ape-llhls-analyzer.js:19` vs `:29` (`HLS_PROBE_TIMEOUT_MS = 4000`) | **FAIL** (menor, doc) |
| F20 | La inyección del edge está **testeada in-repo** con el valor 3×: `PART-HOLD-BACK=1.500` para `PART-TARGET=0.500` | `V/lua/ape_luatest.lua:97-101`; aserción idéntica end-to-end en `V/scripts/smoke.sh:106-114` | **PASS** (intención), **NOT_RUN** (no ejecutado: sin intérprete Lua/nginx en este host) |
| F21 | **Discrepancia de SSOT**: el edge calcula 3×PART-TARGET, pero los SSOT del header (JSON/PHP/JS) fijan `PART-HOLD-BACK` = 1×PART-TARGET | `V/lua/ape_rebase_lib.lua:79-83` (`3.0 * pt`) vs `m3u8_directives_config.json:16` (`1.0` con `PART-TARGET=1.0` en `:28`) y `m3u8-typed-arrays-ultimate.js:2695` (`0.5` con `PART-TARGET=0.5` en `:2694`) | **FAIL** (contradicción interna) |
| F22 | `CAN-SKIP-UNTIL` se emite sin delta playlists: `EXT-X-SKIP` aparece **0** veces en la cadena de emisión — los 23 matches son doctrina/skills, detección o validación (`P/backend/ape_cmaf_dominance_engine.php:90` sólo hace `str_contains($raw,'EXT-X-SKIP')` para clasificar el manifiesto; `P/.agent/scripts/hls_strict_validator.py` y `compatibility_scorecard.py` validan) | `git grep -F 'EXT-X-SKIP' e38a89b` → 23 matches / 16 archivos, 0 emisores | **FAIL** (capacidad declarada sin productor) |
| F23 | El «compliance engine» del repo **no** tiene regla «PART-INF/SERVER-CONTROL exigen `EXT-X-PART`» ni «tag de media playlist en catálogo»: sus `strict_rules` sólo cubren «at most once» y master/EXTINF | `P/frontend/js/ape-v9/omega-compliance-engine.js:190-195` (reglas), `:98-102` (lista de tags LL-HLS) | **FAIL** (hueco de validación) |
| F24 | `V/` (staging del plano de metadata) **no es** el árbol SSOT del Lua del VPS: el SSOT es `P/vps/nginx/lua/` (26 `.lua`) y el VPS corre 14 | `REL/:126-134`; `V/lua/` contiene nombres desplegados (`ape_gateway`, `ape_rebase_lib`, `ape_header`, `ape_uri_rebase`) pero su identidad byte a byte con `/etc/nginx/lua/` **no fue medida por el miembro** | **BLOCKED** (A10) |

---

## 3. Riesgos

| ID | Sev | Impacto | Evidencia | Mitigación |
|---|---|---|---|---|
| R1 | **ALTO** | Un player LL-HLS-capable (Safari/tvOS, hls.js con `lowLatencyMode`) ve `CAN-BLOCK-RELOAD=YES` en el catálogo y emite `_HLS_msn/_HLS_part`: el servidor no tiene handler ⇒ respuesta inmediata/no bloqueante, polling agresivo o fallo de recarga. Latencia percibida peor que sin declarar LL-HLS | F03, F04, F07, F08 | Retirar `CAN-BLOCK-RELOAD` de todo artefacto sin handler; si se quiere LL-HLS, implementarlo **antes** de declararlo |
| R2 | **ALTO** | `PART-HOLD-BACK` < 3×`PART-TARGET` (1×) en los SSOT del header: si algún día hay partes reales, el cliente empieza a pedir antes de que la parte exista ⇒ 404/rebuffer. El propio repo tiene la regla escrita y la viola en 2 de 3 SSOT | F05, F21, `V/lua/ape_rebase_lib.lua:80` | Un solo cálculo (3×) en un solo sitio; validador que rechace `PART-HOLD-BACK < 3×PART-TARGET` |
| R3 | **ALTO** | `EXT-X-MAP` incondicional del emisor fMP4: si `init.mp4` no existe (hoy no existe ninguno en el repo), ExoPlayer/hls.js fallan el init del stream — es exactamente el fallo que T11/B-11 ya sufrió y corrigió en otra ruta | F09, F13, F15 | MAP sólo si `init.mp4` existe **y** hay ≥1 `seg_*.m4s`; test negativo con `glob()` vacío |
| R4 | **MEDIO** | `PRELOAD-HINT:TYPE=PART,URI="…m3u8"` declara un playlist como parte: el cliente lo descarga como chunk y falla el append (mux error) | F06 | Prohibir `PRELOAD-HINT` cuyo URI no sea un segmento/parte real; o eliminarlo |
| R5 | **MEDIO** | `CAN-SKIP-UNTIL` sin delta playlists implica que un cliente con `_HLS_skip=YES` reciba playlist completa creyéndola delta ⇒ desincronización de secuencia | F22 | Omitir `CAN-SKIP-UNTIL` hasta que exista `EXT-X-SKIP` productor |
| R6 | **MEDIO** | La inyección del edge está viva solo si el módulo desplegado coincide con `V/lua/ape_rebase_lib.lua`; si coincide, el VPS **añade** una capacidad que no tiene (D-32: rige lo desplegado) | F08, F24 | Decidir con medición en VPS (lectura) y luego retirar la inyección o implementar el handler |
| R7 | **BAJO** | Divergencia de implementaciones (2 generadores JS homónimos, 4 `manifest_repair_engine`, 2 `ape_hls_generators` con y sin declaración LL-HLS) hace que cualquier fix de S2 se aplique a medias y "reaparezca" en la próxima regeneración | F06, F10, F04 vs `P/vps/production_mirror/ape_hls_generators.php` (0 ocurrencias de `SERVER-CONTROL`/`PART-INF`: **no declara LL-HLS**, misma función, otra generación) | Declarar SSOT único y marcar el resto `_attic/` con registro |

---

## 4. Huecos y NO-RUN

| Ítem | Estado | Causa real |
|---|---|---|
| Estructura fMP4 (`ftyp`/`moov`/`moof`/`trun`/`mdat`) | **NOT_RUN** | No existe **ningún** `.m4s`/`.mp4`/`init.mp4` versionado ni en disco (F15). Verificarlo exige generarlos con ffmpeg — no ejecutado en Council |
| Alineación `TARGETDURATION`↔segmentos en producción | **NOT_RUN** | Producción no sirve media playlists: el artefacto es catálogo M3U Plus con `EXTINF:-1` (cubierto por S1 F13/F22). Sólo hay un fixture sintético alineado (F14) |
| `EXT-X-RENDITION-REPORT` emitido | **NO EXISTE** | 19 matches en CODE, todos parsers/validador/compliance (`omega-compliance-engine.js`, `m3u8-parser-strict-ultimate.js`, `ape-llhls-parser.js`, `ape-ultra-parser-optimized.js`, vendor). Cero emisores |
| Blocking reload real (`_HLS_msn`) | **NO EXISTE** | F07. Probar el comportamiento exigiría un origen LL-HLS vivo (red) ⇒ NOT_RUN por contrato |
| Identidad byte a byte del Lua desplegado | **BLOCKED** | `REL/:78-83` mide 3 módulos (`ape_header`, `ape_uri_rebase`, `ape_wake_on_manifest`), **no** `ape_rebase_lib.lua` ni `ape_gateway.lua`. Sin SSH por contrato ⇒ no se afirma que la inyección corra en el VPS |
| Ejecución de `smoke.sh` §11 y `ape_luatest.lua` | **NOT_RUN** | No hay nginx/Lua en este host; el smoke además apunta a `127.0.0.1:8088` (VPS). Su existencia se cita como intención, no como resultado |
| `P/frontend/js/ape-v9/parsers/fixtures/hls_media_cmaf.m3u8` | **DRIFT** | Citado como fixture CMAF real en `audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md:165`, **no existe** en `e38a89b` (`git ls-tree` sobre ese directorio lista 6 fixtures, ninguno CMAF) |
| `f1_full.m3u8`, `test*.m3u8`, `downloaded_list.m3u8` (raíz) | **NO ANALIZADO** | Fuera de alcance (listas de proveedor/scratch, no emisores). No se usan como evidencia |

---

## 5. Disensos

| # | Doctrina (fuente) | Hecho medido | Resolución propuesta |
|---|---|---|---|
| D1 | `CLAUDE.md:199`: *«`ape-container=fmp4-cmaf` + verified=true sólo si probe encontró `#EXT-X-MAP` + `.m4s`/`init.mp4`»* | El atributo **nunca se emite** (F12). La regla es cierta pero es letra muerta: no hay capacidad CMAF declarada en ninguna lista. Presentarla como "criterio 4 cumplido" es cierto por vacío, no por disciplina | Declarar explícito: «0 declaraciones falsas **porque 0 declaraciones**». Si se quiere CMAF real, primero el packager (F17) y evidencia de bytes |
| D2 | `ape_rebase_lib.lua:73-74`: *«si la fuente YA trae partes, declara que soportamos blocking reload»* | «Declarar» ≠ «soportar»: no existe handler `_HLS_msn` (F07). El comentario reconoce la imposibilidad de empaquetar y aun así declara la capacidad de bloqueo | Reemplazar por `CAN-BLOCK-RELOAD=NO` (u omitir) hasta que exista handler; conservar sólo `PART-HOLD-BACK` calculado del `PART-TARGET` real |
| D3 | Dos SSOT incompatibles: edge 3×PART-TARGET (`ape_rebase_lib.lua:80`, asertado en `ape_luatest.lua:101`) vs header 1× (`m3u8_directives_config.json:16`, `m3u8-typed-arrays-ultimate.js:2694-2695`, `lab_config.lua:114-116`) | Ambos no pueden ser correctos; el que llega al player es el del header (F03) | Un solo dueño del cálculo; el edge debe **leer** del SSOT, no recalcular |
| D4 | `AGENTS.md` condición de éxito: *«No mezclar tags incompatibles en el tipo de playlist equivocado»* + `CLAUDE.md` criterio 4/CMAF | `PART-INF`/`SERVER-CONTROL`/`TARGETDURATION` se emiten en el **catálogo** (F03-F05) y el fixture `selftest.m3u8` mezcla master+media (F16) | Aceptar que la condición se incumple hoy y que el fixture no puede ser la base del harness; separar catálogo vs media playlist también en los fixtures |
| D5 | `docs/…/truth_guards.md:57` («metadata inerte» es legítima) | `#EXT-X-APE-CMAF-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES` (HEAD `m3u8-typed-arrays-ultimate.js:6019`) es inerte por RFC 8216 §6.3.1, pero **afirma** una capacidad inexistente; en el censo de listas aparece **2753 veces** (`_raw_lists_audit.json:3722`) | Disenso de criterio: "inerte" protege al player, no a la auditoría. Etiquetar como `-CLAIM-` o retirarlo; no usar el argumento de inercia para justificar un claim falso |

---

## 6. Tareas propuestas

| # | Título | Rutas | Criterio de aceptación |
|---|---|---|---|
| T1 | Sacar LL-HLS del catálogo (coordinado con S1 T1, que ya lo detectó desde RFC): quitar `PART-INF`/`SERVER-CONTROL`/`TARGETDURATION` del header global | `P/vps/prisma/config/m3u8_directives_config.json:15-16,27-28` · `P/vps/ape_hls_generators.php:188-190` · `P/vps/nginx/lua/lab_config.lua:114-116` · HEAD `P/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:2694-2695` · `P/scripts/m3u8-typed-arrays-ultimate.js:1646-1648` | Artefacto regenerado: **0** `EXT-X-PART-INF`, **0** `EXT-X-SERVER-CONTROL` en catálogo; comando de verificación con exit ≠0 si reaparecen |
| T2 | Resolver `CAN-BLOCK-RELOAD`: implementar handler `_HLS_msn`/`_HLS_part` (shared dict + timer) **o** declararlo `NO` | `V/lua/ape_rebase_lib.lua:76-87` · `V/lua/ape_gateway.lua:209-213` · `P/backend/cmaf_engine/modules/manifest_repair_engine.php:390-410` (+4 copias) | `CAN-BLOCK-RELOAD=YES` **no aparece** en ninguna playlist emitida salvo que `grep -c '_HLS_msn'` en `*.lua` del VPS sea ≥1 (test negativo sembrado) |
| T3 | Unificar `PART-HOLD-BACK` = 3×`PART-TARGET` en un solo cálculo | `m3u8_directives_config.json:16` · `m3u8-typed-arrays-ultimate.js:2694-2695` · `lab_config.lua:114-116` · `ape_rebase_lib.lua:79-83` | Validador: todo `PART-HOLD-BACK` emitido ≥ 3×`PART-TARGET`; caso sembrado 0.5/0.5 ⇒ exit ≠0 |
| T4 | Reparar o eliminar el `PRELOAD-HINT` que apunta a un `.m3u8` | `P/scripts/m3u8-typed-arrays-ultimate.js:1648` | 0 `PRELOAD-HINT` con URI terminada en `.m3u8`; si no hay parte real, no hay hint |
| T5 | Hacer condicional el `EXT-X-MAP` del generador fMP4 (regla honesta, endurecida) | `P/backend/cmaf_engine/modules/dual_manifest_generator.php:189-202` | Con `glob(seg_*.m4s)` vacío o `init.mp4` inexistente ⇒ **0** `EXT-X-MAP`; test unitario con directorio vacío |
| T6 | Añadir a `omega-compliance-engine` las 2 reglas que faltan y un validador ejecutable | `P/frontend/js/ape-v9/omega-compliance-engine.js:190-195` + nuevo `tools/validate_llhls.js` | Exit 0 sobre playlist LL-HLS sintácticamente válida; exit ≠0 sobre: (a) `PART-INF` sin `EXT-X-PART`, (b) `CAN-BLOCK-RELOAD=YES` sin handler conocido, (c) tag de media playlist en catálogo |
| T7 | Medir (solo lectura, autorizado) si `ape_rebase_lib.lua`/`ape_gateway.lua` desplegados contienen `inject_server_control` | VPS `/etc/nginx/lua/` (SSH lectura, fuera de este Council) | `sha256sum` + `grep -c inject_server_control` documentados; decidir retirar la inyección (si está) o cerrar el riesgo R6 con evidencia |

---

**Alcance respetado:** sólo lectura sobre fuentes; único archivo escrito = este entregable. No se ejecutó generador/ffmpeg/Lua, no se contactó VPS/proveedor, no se imprimieron secretos (no se hallaron credenciales en las rutas auditadas).
**Cruce con pares:** S1 F12/T1 (mismo hallazgo desde RFC 8216 — aquí se atribuye al emisor y se cuantifica); S6 **no** cubrió `SERVER-CONTROL`/`inject_server_control` (`grep` sin matches en `S6_nginx_lua.md`), por lo que A3/F08 quedan bajo ownership de S2.
