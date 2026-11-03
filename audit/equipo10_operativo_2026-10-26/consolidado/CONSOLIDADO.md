# CONSOLIDADO DEL COUNCIL — Equipo enterprise 10 · IPTV Navigator PRO v5.4

**Tarea:** `t11` (i3) · **Fase:** Implementación — consolidación por NO-autor · **Autor:** `s5-qoe-qos`
**Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`) · **Consolidado:** 2026-10-26
**Entradas leídas de disco:** 8 informes `council/*.md` · `verificacion/HARNESS.json` (21 chequeos) · `snapshot/{SNAPSHOT,REPORT_HASHES}.json` + `snapshot/REGLA_DE_ORIGEN.md` · `adn/PROTOCOLO_COUNCIL.md`.
**Escrituras:** solo `consolidado/` (4 archivos). Cero ediciones a informes ajenos, cero VPS, cero secretos impresos.

---

## 0. Gobierno de autoría (recusación por capítulo)

| Informe | Autor (member) | Consolidado por | Conflicto |
|---|---|---|---|
| `S1_hls_m3u8.md` | `s1-hls-architect` | `s5-qoe-qos` | NO |
| `S2_llhls_cmaf.md` | `s2-llhls-cmaf` | `s5-qoe-qos` | NO |
| `S3_S4_codec_color_hdr.md` | `s3-codec-hdr` | `s5-qoe-qos` | NO |
| `S5_qoe_telemetria.md` | `s5-qoe-qos` (**yo**) | — | **SÍ** → *AUTOR — no autovalidado; validación pendiente del capitán* |
| `S6_nginx_lua.md` | `s6-nginx-lua` | `s5-qoe-qos` | NO |
| `S7_S10_sre_seguridad.md` | `s7-sre-secops` | `s5-qoe-qos` | NO |
| `S8_red_tcp_quic.md` | `s8-net-tcp-quic` | `s5-qoe-qos` | NO |
| `S9_player_compat.md` | `s9-player-compat` | `s5-qoe-qos` | NO |

**Alcance de mi rol:** consolido 7 capítulos ajenos (cuento sus números desde sus tablas, no los re-mido) y **transcribo** el capítulo S5 sin autovalidarlo. Su veredicto en `SCORECARD.json` es `PENDIENTE_VALIDACION`. La auditoría independiente es de `t12` (`s9-player-compat`), que a su vez tiene conflicto declarado sobre `c8` (`adn/PROTOCOLO_COUNCIL.md`).

---

## 1. Coordenadas de blob (obligatorias) y estado del worktree

`REGLA_DE_ORIGEN.md` §1-§2 exige declarar la coordenada de cada medición. Este es el mapa real:

| Coordenada | Identidad | Inmutabilidad | Uso en este consolidado |
|---|---|---|---|
| **HEAD `c1277bdf`** | generador `m3u8-typed-arrays-ultimate.js` · 707.323 B · **11.144 L** (LF) | inmutable (objeto git) | **única coordenada admisible para el generador** |
| **HEAD tree `e38a89b`** | árbol completo del commit | inmutable | conteos `git grep`/`git ls-tree` (S2, S7/S10) |
| **WT `da442864`** | copia congelada 04:29:02 · 743.883 B · 11.524 L | congelada | citada por quien midió ese WT |
| **WT `d29f62af`** | copia congelada 04:27:34 · 743.867 B · 11.524 L | congelada | ídem (prueba de mutación) |
| **WT `23b25b03` / `393635c2`** | `_vps_stage/lua/ape_header.lua` 8.088 B · `ape_uri_rebase.lua` 9.930 B | congeladas | **S6 §4 midió ESTOS** |
| **WT histórico ~04:12** | 21.581 líneas, **no conservado** | **no existe** | solo S1-F01/F02 (histórico) |
| **WT vivo (efímero)** | 748.145 B · **11.594 L** · `c1301f1f` · mtime 08:18 · `git status` 59 (16 M/3 D/40 ??) | **mutó ≥6 veces** | **no se cita como estado** |

**S1-F01 es HISTÓRICO y está SUPERADO.** `+10.447/−10` se midió ~04:12 sobre un WT de 21.581 líneas que ya no existe; el WT vigente declara `+455/−5`. No describe HEAD ni el WT actual ⇒ **sus cifras no entran en ningún total como estado vigente** (`REGLA_DE_ORIGEN.md:34-36`).

---

## 2. Normalización de taxonomías (obligatoria antes de contar)

| Taxonomía de origen | Informe(s) | Equivalencia aplicada |
|---|---|---|
| `CONFORME` | S3, S4 | → **PASS** |
| `HALLAZGO` / `HALLAZGO/WARN` | S3, S4 | → **FAIL** |
| `NO-RUN` | S3, S4 | → **NOT_RUN** |
| `SÍ` / `NO` / `Parcial` (columna «Cumple») | S6 | SÍ→PASS · NO→FAIL · Parcial→*parcial* (se cuenta aparte, **no** como PASS) |
| `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | S1,S2,S5,S7,S8,S9,S10 | sin cambio |
| `PASS con reserva` / `PASS parcial` / `PASS con drift` | S9, S6, S8 | PASS + marca de calificación (`parcial`/`con_reserva`), nunca PASS limpio |
| Ver. compuesto (`PASS en datos / FAIL por-player`) | S9 C3 | **FAIL** (regla: ante veredicto dual se toma el más restrictivo) |

**Regla anti-suavizado:** un ítem se cuenta como PASS solo si su veredicto literal es PASS/CONFORME/SÍ. Todo `Parcial`, `WARN`, `con reserva` o dual se registra en `parcial`/`warn` y **no** suma como PASS.

---

## 3. Tabla maestra por dimensión (contada por dimensión, no por archivo)

| Dim | Informe | Tabla base (líneas) | pass | fail | blocked | not_run | parcial/warn | ítems con veredicto / declarados | blob |
|---|---|---|---|---|---|---|---|---|---|
| **S1** | S1_hls_m3u8 | §2 hechos F01–F22 (30-51) | 8 | **12** | 0 | 2 | 0 | **22 / 22** | WT histórico (F01/F02) + artefactos |
| **S2** | S2_llhls_cmaf | §1 afirmaciones A1–A12 (16-27) | 4 | 5 | 1 | 2 | 0 | **12 / 12** | HEAD tree `e38a89b` |
| **S3** | S3_S4 (sección S3) | §Totales S3 (207) | 15 | 12 | 0 | 5 | 0 | **32 / 34** | HEAD `c1277bdf` + WT `20ac4b26` |
| **S4** | S3_S4 (sección S4) | §Totales S4 (208) | 8 | 11 | 0 | 4 | 0 | **23 / 24** | HEAD `c1277bdf` + WT |
| **S5** | S5_qoe_telemetria | §6.2/§6.4 hallazgos (119-151) | 0 | 15 | 0 | 0 | 0 | **15 / 15** | HEAD `c1277bdf` + `c8830f58` |
| **S6** | S6_nginx_lua | §3 invariantes (47-60) | 8 | 3 | 0 | 0 | 1 | **11 / 12** | WT `23b25b03`/`393635c2` |
| **S7** | S7_S10 (sección S7) | *sin tabla de veredicto* | n/d | n/d | n/d | n/d | n/d | **0 / 0** | HEAD tree `e38a89b` |
| **S8** | S8_red_tcp_quic | §2 invariantes (27-43) | 6 | 3 | 0 | 0 | 2 | **9 / 9** | HEAD tree + mediciones de tercero |
| **S9** | S9_player_compat | §8 controles C1–C8 (96-103) | 2 | 3 | 1 | 1 | 1 | **7 / 8** | WT vivo (S9 declara WT) + `HEAD:` donde aplica |
| **S10** | S7_S10 (sección S10) | §7 endpoints (149-156) | 2 | 4 | 0 | 1 | 1 (WARN) | **7 / 8** | HEAD tree `e38a89b` |
| **TOTAL** | 9 dimensiones con tabla | — | **53** | **68** | **2** | **15** | **6** | **138 / 144** | — |

*Lectura del total:* **138 = 53+68+2+15** son los ítems con veredicto PASS/FAIL/BLOCKED/NOT_RUN (la suma que verifica `SCORECARD.json`). Los otros **6** son ítems declarados sin veredicto binario: 1 `parcial` (S6), 1 `parcial` (S9), 1 `WARN` (S10) y los **3 hechos sin veredicto** de S3 (2) y S4 (1) — ver X6.

**S7 no tiene tabla de veredicto por fila** ⇒ sus counts son `null` y **no** entran en el total. El autor emite veredicto compuesto: *WARN (repo) · BLOCKED (operación 365 d)*. Hechos que sí publica: 40 unidades trackeadas (30 `.service`/9 `.timer`/1 `.path`), 34/40 `ExecStart` resuelven a archivo del repo, 1 huérfana (`upload-server` ×5), 4 unidades con `StartLimit*` en `[Service]`, 1 auto-bucle (`netshield-watchdog` ~125 s), **8 huecos de cobertura verificados por ausencia** (0 alertas, 0 TLS, 0 liveness, 0 métricas, 0 gate post-deploy).
**Sub-tabla S7 §2 (23 filas agrupadas):** SÍ 21 · NO 2 · PARCIAL 1 — criterio = «¿existe la fuente del `ExecStart`?», **no** calidad SRE; no se usa como veredicto de dimensión.

**Totales de severidad** (solo donde el autor la declara: S5, S8, S9): **CRITICAL 5 · HIGH 22 · MEDIUM 18 · LOW 4 · INFO 2 = 51 hallazgos**. S1 (7 riesgos: 3 ALTO/3 MEDIO/1 BAJO), S2 (7: 3/3/1), S3 (5), S4 (5), S6 (§5.6: 2 ALTA/3 MEDIA/1 BAJA), S7 (4), S10 (4) usan escalas propias que **no se agregan** con las anteriores.

---

## 4. Hechos confirmados (fuente + blob)

| # | Hecho | Fuente | blob |
|---|---|---|---|
| H01 | HEAD `e38a89b`; WT sucio 59 entradas (16 M/3 D/40 ??) y **mutando** (11.594 L, `c1301f1f`, mtime 08:18) | `git rev-parse HEAD`; `git status --porcelain`; `Get-FileHash` | WT vivo (efímero) |
| H02 | **`_vps_stage/lua/ape_header.lua` de HEAD es BYTE-IDÉNTICO a producción**: 2.210 B, sha256 `a15e1fe3…` | sha256 del `snapshot/ape_header.lua.HEAD.blob` == `VPS_REALITY_MEASURED:80` | HEAD `5b995337` + prod `a15e1fe3` |
| H03 | **`_vps_stage/lua/ape_uri_rebase.lua` de HEAD es BYTE-IDÉNTICO a producción**: 6.043 B, sha256 `1d456a46…` | sha256 del `snapshot/ape_uri_rebase.lua.HEAD.blob` == `VPS_REALITY_MEASURED:81` | HEAD `3738b5ae` + prod `1d456a46` |
| H04 | `vps/nginx/lua/` **no** contiene `ape_header.lua` ni `ape_uri_rebase.lua`; solo `ape_wake_on_manifest.lua` | `git ls-tree -r --name-only e38a89b` | árbol `e38a89b` |
| H05 | Producción corre **3 fases** (`header_filter`/`body_filter`/`log`); el repo cablea **7** | `VPS_REALITY_MEASURED:78-85`; S6 §2 | tercero medido + `e38a89b` |
| H06 | Generador HEAD = `c1277bdf`, 707.323 B, 11.144 L; WT actual 11.594 L | `SNAPSHOT.json`; medición de hoy | HEAD `c1277bdf` / WT vivo |
| H07 | **2.574** URLs Xtream con `user:pass` en `channels_map.json`; **2.598** sitios / 9 archivos en todo el repo | S10 §8; harness C15 | HEAD tree |
| H08 | **72** emisiones tóxicas vivas + **6** valores tóxicos por defecto + **27** emisiones de `DNT`; **84** sitios en `APE_ALL_PROFILES_OPTIMIZED.json` | C11/C12/C13; S9-11; S10 §9 | HEAD tree |
| H09 | Auth **fail-open** en `prisma-control.php` (Bearer aceptado sin validar; clave ausente ⇒ `true`) | S10 §7 fila 1 (`:32-51`) | HEAD tree |
| H10 | **0** canales de alerta · **0** renovación TLS · **0** liveness de watchdogs · **0** gate post-deploy | S7 §5 (ausencias verificadas con `git grep` → 0) | HEAD tree |
| H11 | 4 unidades con `StartLimit*` en `[Service]` (ignorado por systemd) + auto-bucle `netshield-watchdog` ~125 s | S7 §3 | HEAD tree |
| H12 | 22 hallazgos S8: 3 CRITICAL; `wg0.conf` del repo inválido (2 directivas en 1 línea); "3 túneles" no desplegados; MTU 1380+60 > 1280 | S8 §2/§3/§5 | HEAD tree + `state-snapshot.txt` (tercero) |
| H13 | 2 cruces GOLDEN RULE en `backend/resolve_quality_unified.php:5035,5037`; Ley Cardinal 1 violada en `omega_ecosystem_v5.1/resolve_quality_unified.php:54,55` | S3 §S3.2/§S3.3 | **WT `20ac4b26`** para `backend/…` (S3 M3: «resto de citas del WT») + **HEAD tree** para `omega_ecosystem_v5.1/…` (archivo no sucio) |
| H14 | Ningún productor QoE desplegado; `qoe_score` del lazo de decisión es un **stub de 5 constantes**; cifras QoE fabricadas en artefactos emitidos | S5-01/S5-02 | HEAD `c1277bdf` + `c8830f58` |
| H15 | Harness: 21 chequeos, **exit 1** (10 PASS/10 FAIL/1 NOT_RUN); C19 FAIL porque el WT cambió entre el congelamiento y la ejecución; C21 PASS (4/4 declarados coinciden) | `HARNESS.json:13-19` | WT al 04:33:50 |

---

## 5. Contradicciones entre especialistas (con causa; no se elige por decreto)

| # | Contradicción | Causa medida | Tratamiento |
|---|---|---|---|
| **X1** | S6 afirma que **2 de 3 fases divergen** (repo 8.088 B vs prod 2.210 B; 9.930 vs 6.043) — pero **H02/H03 prueban que HEAD == producción** | S6 §4 midió los **WT** `23b25b03`/`393635c2`, no HEAD. Su frase es cierta para el WT y **falsa para HEAD** | Se registran ambas; el hecho consolidado es H02/H03 (HEAD idéntico). *No* se corrige el informe ajeno |
| **X2** | S6 D2 concluye «**3 arquitecturas** (manifiesto, repo, VPS), no 2» | Depende de X1. Con HEAD: **2 arquitecturas** (HEAD≈VPS; el WT es el desvío) + el manifiesto | Se registra como disenso abierto; la evidencia de H02-H04 favorece «HEAD es la fuente desplegada de 2 de 3 fases» |
| **X3** | S1 declara «**20 hechos**, PASS 8 · FAIL 10 · BLOCKED 0 · NOT_RUN 2» | Su tabla §2 tiene **22 filas** y **12 FAIL** (conteo propio reproducible) | Cuento la tabla: 8/12/0/2 = 22. El resumen del autor quedó corto |
| **X4** | S6 declara «**12 filas** → 8 SÍ / 3 NO / 1 Parcial» | Su tabla §3 tiene **14 filas** (9 SÍ/4 NO/1 Parcial); 3 filas son un solo invariante (`limit_conn`) | Uso la base del autor (12) y registro la tabla cruda (14). Ninguna cifra se mezcla con otro blob |
| **X5** | S9 t8 resumió «3 PASS · 3 FAIL» | §8 tiene 8 controles; **C3 es dual** (`PASS en datos / FAIL por-player`) y se contó dos veces | Cuento C3 como FAIL: 2/3/1/1 + 1 parcial = 8 |
| **X6** | S3/S4 declaran 34 y 24 hechos | 15+12+5 = **32** ≠ 34 (gap 2) · 8+11+4 = **23** ≠ 24 (gap 1) | Se registra el gap: **3 hechos no tienen veredicto** en la tabla del autor. No se rellenan |
| **X7** | Material secreto WireGuard: S10 dice **3 PrivateKey + 1 PSK**; harness C14 dice **9** (5 PrivateKey + 3 PSK + 1 CLI_BASIC_AUTH) | **Alcance distinto**: S10 midió `*.conf` productivos; C14 barrió todo el repo (incluye `SKILL.md` que EMBEBE la clave ×2 copias + `wg0.conf.BASELINE` + `_archive`) | **Ambas ciertas con su alcance**; se registran las dos, no se elige |
| **X8** | S10 §8 dice 2.574 credenciales Xtream; C15 dice 2.598 sitios/9 archivos | 2.574 = 1 archivo (`channels_map.json`); 2.598 = 9 archivos (+13 `_raw_lists_audit` +4 `fallback_proxy.php`…) | Se registran ambos denominadores |
| **X9** | C09 (`15` `.claude/agents` vs doctrina `10`) + C10 (`9` commands vs `7`) | No contradice a S1-F21/S9-14 (que miden **contenido** plantilla, no cantidad): son ejes distintos | Se registran como hallazgos independientes, no como contradicción |
| **X10** | `SNAPSHOT.json` declara WT `da442864` y C19 lo ve distinto `ddce94ca` | El WT **mutó entre** 04:29:02 y 04:33:50 ⇒ el snapshot vale para su `captured_at`, no para hoy | Todo hallazgo WT es histórico; ninguno se cita como estado vigente |

---

## 6. Disensos no resueltos (heredados, sin resolver por el consolidador)

- **D1 (S1-D1 / S2-D5 / S4-D-S4-1).** Doctrina vs RFC 8216: `EXT-X-I-FRAME-STREAM-INF` sin `URI=` (§4.3.4.3 lo exige) y efecto real de tags APE/`VIDEO-RANGE` (inerte por §6.3.1) frente a la doctrina de «palanca de imagen».
- **D2 (S3-D-S3-1).** F4: `CLAUDE.md` dice `avc1.640028`, el código emite `hvc1.2.4.L93.B0`. S3 sostiene que gana el código (decisión posterior del propietario) y se corrige la doc.
- **D3 (S4-D-S4-4).** `CHINA_BOX_FAKE_4K=true` en `combined_body_filter.lua:335` apaga el guard LEVER B. ¿Orden explícita del propietario (sin acta) o guard desactivado? **Disenso abierto**, no violación.
- **D4 (S6-D6).** `proxy_set_header Referer "https://www.netflix.com/"` (`shield-location.conf:75`): suplantación de marca ajena ante el proveedor; **no desplegado**, requiere decisión del propietario.
- **D5 (S7-D1).** `ape-supervisor@:15-20` afirma que `ape-ingest@` no debe llevar `WatchdogSec`; `ape-ingest.sh:427-464` lo implementa bien ⇒ gana el código, se corrige el comentario.
- **D6 (S8).** `wg0` MTU 1340 vs 1380; `rmem_max` 256 MB en caja de 3,8 GB; HTTP/3 no prioritario con binario 1.24.0.
- **D7 (S9-D2/D3).** «Manifiesto universal multi-player» vs 7 manifiestos; PRISMA inyecta EXTVLCOPT/KODIPROP sin detectar player.
- **D8 (S10-D3).** `SECRETS_SCAN.md:114` («ninguno contiene credenciales») es cierto para **campos JSON** y falso para **credenciales en el path** (2.574 sitios).
- **D9 (S5).** `VST_proxy` no es VST; umbral 2 % vs 5 %; `SCORECARD` ¿target o medición? — **pendiente de validación del capitán** (capítulo propio).

---

## 7. Tareas recomendadas (deduplicadas) con dueño propuesto

| # | Tarea | Objetivo verificable | Dueño propuesto |
|---|---|---|---|
| T1 | **Rotar y purgar credenciales**: 3 WG `PrivateKey` + 1 PSK (alcance S10) — y revisar las 5+3+1 que ve C14 | `git grep` de los patrones = 0; claves rotadas fuera del repo | `s7-sre-secops` (S10) + propietario |
| T2 | **Cerrar fail-open de `prisma-control.php`** (clave ausente ⇒ 503, nunca 200; validar Bearer) | Test negativo: sin `/dev/shm/prisma_key.txt` ⇒ 503 | `s7-sre-secops` |
| T3 | **Purga de tóxicos**: vaciar `DEFAULT_HEADER_VALUES` (6) y las 72 emisiones vivas; decidir `DNT` | Validador falla si la lista emitida contiene cualquiera de los 7 | `s9-player-compat` + `s7-sre-secops` |
| T4 | **Sacar LL-HLS/tags master del catálogo**: `PART-INF`/`SERVER-CONTROL`/`TARGETDURATION`/`SESSION-DATA` fuera del header; `VERSION:9→7` | 0 `EXT-X-PART-INF`, 0 `EXT-X-SERVER-CONTROL`, 1 `VERSION:7` en artefacto regenerado | `s1-hls-architect` + `s2-llhls-cmaf` |
| T5 | **Quitar cifras QoE fabricadas** del emisor (MOS/PSNR/SSIM/VSTQ/TR101290/`REBUFFER=0`) y de `X-Metrics-Endpoint` ajeno | 0 tags con métricas no medidas; endpoint propio o eliminado | `s5-qoe-qos` (validación: capitán) |
| T6 | **Cerrar el stub de `qoe_score`** o declararlo explícitamente no-medición y desacoplar `riskScore` | `conviva_qoe_server.php` sin tabla de constantes alimentando decisión | `s5-qoe-qos` |
| T7 | **Quitar el default `hvc1.2.4.L150.B0` de F1** y alinear F4 doc↔código | Sin `videoCodec` ⇒ sin `CODECS=` HEVC inventado | `s3-codec-hdr` |
| T8 | **Resolver LEVER B**: acta de `CHINA_BOX_FAKE_4K` o corregir doc | Una sola fuente de verdad sobre el guard | `s3-codec-hdr` + propietario |
| T9 | **Corregir política de reinicio**: `StartLimit*` a `[Unit]` (4 unidades); `sd_notify` o quitar `WatchdogSec`; `flock`/`trap` en sentinel | `systemd-analyze verify` limpio (requiere host) | `s7-sre-secops` |
| T10 | **1 canal de alerta + `certbot renew` versionado** | Existe unidad/timer y un `OnFailure=` | `s7-sre-secops` |
| T11 | **`nginx -t` reproducible**: versionar `nginx.conf`, zonas `xtream_slot`/`hard_cap` y `lua_package_path` | `nginx -t` sobre el árbol pasa aislado | `s6-nginx-lua` |
| T12 | **Reparar el regen headless** (`window.APE_GEN` → `generateM3U8Stream is not defined`) | Harness puede medir bytes emitidos sin navegador | `s1-hls-architect` + `s9-player-compat` |
| T13 | **Decidir destino del WT divergente** de `ape_header`/`ape_uri_rebase` (H02-H04): HEAD==prod, el WT no | Una sola rama; WT no se publica como SSOT | capitán |

---

## 8. Límites de este consolidado

1. **No re-medí** los hallazgos ajenos: los conté desde sus tablas y verifiqué **existencia, tamaño y hash** de cada informe (§`INTEGRIDAD_DE_INFORMES.md`). Solo añadí **dos mediciones propias** (H02/H03: sha256 de blobs congelados vs hashes de producción de tercero) y el conteo reproducible de las tablas.
2. **Colisión de numeración resuelta:** cada especialista usó su prefijo (`S1-Fxx`, `S8-xx`, `S9-xx`, `S5-xx`); no hay IDs duplicados entre dimensiones.
3. **Nada de lo WT es estado vigente.** El WT mutó ≥6 veces durante la auditoría (21.581 → 11.443 → 11.459 → 11.524 → 11.524 → 11.519 → 11.594). Los únicos hechos estables son los de HEAD `c1277bdf` / árbol `e38a89b`.
4. **Totales heterogéneos.** Los 138 ítems del §3 provienen de tablas con granularidad distinta (22 hechos S1 ≠ 34 hechos S3 ≠ 8 controles S9). El total **solo** es válido como suma aritmética declarada; **no** es un índice de calidad ni permite comparar dimensiones.
5. **Lo que falta no es PASS.** S7 sin tabla ⇒ `counts: null`. C03 (`nginx -v`) = NOT_RUN. Ningún ítem no medido se contó como PASS en este consolidado.
