# AUDITORÍA DEL PLAN REA (t25) — independiente, con recusación del capítulo propio

**Auditor:** `s9-player-compat` · **Fecha:** 2026-10-27 · **Snapshot:** `git HEAD a8ff0e9` (`a8ff0e946524f945f89858c9c6c620aeb5f31813`)
**Recusación:** soy autor de `docs/rea/05_PLAYER_COMPAT.md` ⇒ **no lo audito**; lo valida el capitán. Audito `01`, `02`, `03`, `04`, el plan y las correcciones C-1..C-4.
**Docs auditados (sha256-12 recomputado):** `01` e6872b48c3ee · `02` 5fefd290eaee · `03` f8989348e5c4 · `04` 157f32227a1c · `PLAN_REA.md` aa0a82b354c7 — los 5 coinciden con lo declarado por sus autores.
**Método:** solo lectura + re-ejecución de lo ejecutable. No reescribí ningún doc; solo escribí este informe y su JSON.

## 1. Veredicto por sección (sin promedios)

| Sección | Veredicto | Base |
|---|---|---|
| §1 Tabla de verdad | **PASS** | 8/8 filas muestreadas coinciden con su fuente; 13 REAL · 8 POSIBLE · 7 FALSO · 4 IMPOSIBLE (ver AU-02 por el conteo ajeno 9/5) |
| §2 Fase 0 | **FAIL** | F0-2 conserva `declare_auto`, pero su umbral `max_resolution ≥ 3840` **admite 8K sobre fuente 4K** (AU-01) |
| §3 Fase 1 (nodo GPU) | **PASS** | coste y HW con URL; NVENC/CDN `NOT_RUN`; gate de propietario; build MEDIDO no reproducible aquí (AU-07) |
| §4 Fase 2 (player/VPP) | **PASS** | delega AI-PQ, no delega `hdr_conversion_mode`; GAP de emisión por player declarado |
| §5 Vetos V-1..V-10 | **PASS** | coherentes con 01/04/05; V-3 contradice a F0-2 ⇒ se resuelve en AU-01, no se absuelve |
| §6 Gates + rollback | **PASS** | G3 ejecutado `exit 1` y G4 `8/8` (re-ejecutados aquí); G2 dry-run con log; G8/G12 = GAP declarados; rollback definido |
| §7 Backlog | **PASS** | exactamente 12 (B-01..B-12), dueño y criterio; B-11 separado como compra gateada |
| `declare_auto` intacto | **PASS** | F0-2 lo **conserva** y acota; V-4 veta quitarlo; ninguna fila lo sustituye |
| Coste 0 | **PASS** | único importe: B-11 €423 1.er mes (04 §5.2-5.3), gateado; Fase 0 sin gasto/proveedor |
| Trazabilidad | **PASS** | 0 huérfanas reales en §1–§6 (88/88 filas de datos con `doc §` o `archivo:línea`); §7 referencia F0-xx (indirecta) |
| Cero ficción / secretos | **PASS** | 0 secretos en `docs/rea/`; 0 CV/persona/cert/experiencia; 1 medición de entorno no reproducible marcada NO_VERIFICADO (AU-07) |
| **GLOBAL** | **FAIL** | 1 FAIL abierto (AU-01 HIGH) ⇒ no se declara PASS |

## 2. Muestreo de verdad (re-ejecutado o releído contra la fuente)

| # | Claim del plan | Fuente citada | Verificación | Resultado |
|---|---|---|---|---|
| 1 | `tonemap` FFmpeg **no** implementa BT.2390 (FALSO) | 01 §1 · ffmpeg-filters#tonemap | 01:40 "MEDIDO: las 7 curvas no incluyen BT.2390" | **CONFIRMADO** |
| 2 | `libplacebo` exige GPU (Vulkan 1.2/GL3.0/D3D11 FL9_1) | 01 §1 + libplacebo README | 01:22 idéntico | **CONFIRMADO** |
| 3 | 1080p→4K por software = 8-9 s/segmento ⇒ edge IMPOSIBLE | 01 §6; 04 §2/§4 | 01:26 y 01:105 "MEDIDO repo"; 04:327 8,9 fps ⇒ 3 s/0,356 = 8,4 s | **CONFIRMADO** |
| 4 | Transcode 4K en VPS = NO-GO (`7,61 core·s/s`; `floor(2,1/7,61)=0`) | 04 §2/§4 · `docs/MEDIA_FANOUT_FEASIBILITY.md:325-332` | líneas 327-329: **8,9 fps · 0,356× · 269 % · 7,61** y `medium` 12,62 | **CONFIRMADO** (fuente existe y coincide) |
| 5 | iGPU Intel UHD: libplacebo 1080p→2160p = **21,9 fps** | 03 §6 TEST 7 | 03:184 "**21,9 fps** (2,28 s)" | **CONFIRMADO en el doc**; sin binario en disco ⇒ NO_VERIFICADO como medición |
| 6 | LEVER B **apagado** (`CHINA_BOX_FAKE_4K=true`) y solo en la copia de 22.685 B | C-4 | `vps/nginx/lua/combined_body_filter.lua:335` (4 menciones); copias raíz 7.866 B y bundle 14.960 B = **0** menciones | **CONFIRMADO** |
| 7 | E5-F4: `ape_uhd:97-98` declara 8K si `w≥3840`, ejecutado con `uhd_auto=1` aunque `uhd8k=0` | C-3 | `ape_uhd.lua:97-98` + `ape_gateway.lua:279,281` | **CONFIRMADO** |
| 8 | 443 **no** proxea `/_ape/*`; API en 8088 loopback con `allow 127.0.0.1` | C-1 / F0-8 | `_vps_stage/public/ape-meta-public.conf` = `/cdn/`, `/ape/health`, `/ape/lab-upload`; `meta-plane.conf:97-107` `/_ape/luatest` y `/_ape/flags` con allow loopback; `set_real_ip_from`/`real_ip_header` = **0** | **CONFIRMADO** |
| 9 | Blind spot: `ape_obs.lua` = 0 `uhd4k/uhd8k`; contadores en `ape_gateway.lua:480-481` | C-2 | grep = 0 y líneas 480-481 `qinc("uhd4k")/qinc("uhd8k")` | **CONFIRMADO** |
| 10 | DV P5 sin fallback HDR10; P8.1 sí | 01 §4 | 01:72 "DV Profile 5 (single-layer, **sin** base HDR10 compatible)" | **CONFIRMADO** |
| 11 | GAP: «9/9» no aparece en 01..05 | PLAN §6 G12 | grep `9/9` en `docs/rea/*.md` → solo PLAN_REA (2 menciones, la propia) | **CONFIRMADO** (GAP honesto) |
| 12 | G3 hoy `exit 1` por E5-F4 | 02 §1.4 C4 | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` → **exit 1**, blocker `UHD-09 … 7680x4320@hvc1.2.4.L153.B0` | **CONFIRMADO** (re-ejecutado) |

## 3. `declare_auto`: ¿el plan lo conserva? — **SÍ, veredicto explícito**

- F0-2 lo **conserva** y lo acota (`can_declare_8k`), con degradación honesta a 4K; V-4 **veta** quitarlo; §1 fila 47-48 lo marcan REAL/POSIBLE (no FALSO). Ninguna fila de §2/§3/§5 lo elimina ni lo sustituye.
- F0-4 toca solo `add_pq` (VIDEO-RANGE) y F0-2 el techo 8K: son **acotamientos**, no sustitución. **No hay blocker de recusación.**
- **Pero** el acotamiento es incompleto: ver AU-01.

## 4. Trazabilidad

- §1–§6: **88/88 filas de datos** con `doc §` o `archivo:línea` (parseo por fila, 5 encabezados excluidos). **0 huérfanas reales.**
- Correcciones C-1..C-4: fuente = código/capitán, no `doc §` (declarado como "verificado por mí" en el plan). Correcto.
- §7 (backlog B-01..B-12): no cita `doc §`, referencia `F0-xx`/`F1`/`F2` ⇒ trazabilidad **indirecta** (LOW, AU-05).
- Contradicciones entre docs: `05 §3` «P5 sin fallback» vs `01 §4` idéntico (sin contradicción); `04` E3 WebRTC NO-GO vs `05` players HLS (coherente); **única contradicción**: V-3 vs F0-2 (AU-01).

## 5. Coste

- Fase 0: **€0** — solo Lua/PHP/JS del repo y flags; sin proveedor, sin egress nuevo, sin hardware.
- Fase 1: **€423,00 el 1.er mes** (€214,00/mes + €209,00 setup, IVA exento) con URL de Hetzner (04:118; 04:15 GEX45). **Gate de propietario** explícito (§3 encabezado).
- `NOT_RUN` declarados: coste CDN del fan-out (04 §7), NVENC 4K (04 §2.4). **Ningún otro gasto** aparece en el plan ⇒ criterio del capitán cumplido.

## 6. Gates (medibles y con rollback)

| Gate | Ejecutable hoy | Evidencia |
|---|---|---|
| G1 backup/verify | Sí (existen) | `_vps_stage/edge/baseline/phase0_backup.sh` (5.086 B) y `phase0_verify.sh` (2.174 B) — el plan omite la ruta (AU-05) |
| G2 rollback dry-run | Sí | `restore_phase0.sh` + `runs/20261026T201548Z/restore_dryrun.log` = `DRYRUN: nada escrito` · `RESULT=OK` |
| G3 guard doctrina | **Sí, re-ejecutado** | `exit 1` (esperado hoy); `UHD-09` blocker |
| G4 selftest guard | **Sí, re-ejecutado** | `SELFTEST: PASS (8/8)` · exit 0 |
| G5 `/_ape/luatest` | No (loopback VPS) | `NOT_RUN` por contrato `iptv-vps-touch-nothing` |
| G10 TTFB | Sí, con baseline | `docs/edge/BASELINE.md:215` = «Δ TTFB ≈ 31–51 ms» (pareado); el plan no promete mejora, exige medir pre |
| G8/G12 | **GAP declarados** | G8 sin baseline de hashes de listas; G12 «9/9» inexistente en 01..05 ⇒ sustituido por G3+G4+G5 |

**Rollback:** definido en una línea + orden (backup → medir pre → aplicar → guard/selftest/luatest → medir post → rollback inmediato si falla). **PASS.**

## 7. Riesgos de regresión OMITIDOS

| # | Riesgo | Por qué importa |
|---|---|---|
| R1 | **F0-2 declara 8K sobre 4K** si el master es 4K con `L183` (el flag `uhd8k` es global, no por host) | Es exactamente la mentira que V-3 prohíbe; la matriz de 02 §1.3 no tiene el caso «4K L183» (AU-01) |
| R2 | **F0-8 token**: 15 archivos del repo usan `/_ape/*` (gateway, `ape_lab_api`, `ape_luatest`, `deploy/verify.sh`, `generation-controller.js`) | Un 403 sin token puede romper el plano de laboratorio si el gate corre antes que `allow 127.0.0.1`; el plan no migra llamadores (AU-03) |
| R3 | **F0-11 microcaché**: clave no especificada (token/UA/host) | Si la clave omite el token, se sirve un manifiesto de otro cliente; V-8 solo cubre TTL (AU-04) |
| R4 | **F0-6 `STABLE-VARIANT-ID`**: atributo nuevo en `STREAM-INF` | RFC lo permite, pero TiviMate/OTT/VLC son `NO_VERIFICADO` (05 §1): parser estricto podría rechazar la variante |
| R5 | **F0-10 cambia el generador**: canales sin probe dejan de llevar `CODECS=` | Listas ya publicadas/cacheadas por clientes **no se pueden retirar**; G8 mide listas del VPS, no listas generadas; no hay gate de contenido de lista |
| R6 | **F0-1 extiende `/_ape/health`** | Consumidores que parsean el JSON estricto (watchdogs/sentinels) pueden romperse; el plan no enumera consumidores |

## 8. Cero ficción y cero secretos

- Barrido de `docs/rea/*` (6 archivos): **0** PEM, **0** `PrivateKey`/`PresharedKey` con valor, **0** `user:pass@`, **0** token literal; **0** CV/curriculum/certificación/experiencia/PhD. Los 2 hits de «certificación» son «Licencia/CM de Dolby» y una URL, no credenciales.
- **Sin ficción de resultados**: Fase 0 declara «no ejecutado»; NVENC/CDN/mpv/luatest/build sandbox/Real-ESRGAN vídeo/matriz de devices = `NOT_RUN`. Única medición no reproducible aquí: build FFmpeg (`sha256 74db6c18…`) e iGPU 21,9 fps — no hay binario en disco ⇒ **NO_VERIFICADO**, no se promueve (AU-07).

## 9. Hallazgos

| ID | Sev | Hallazgo | Corrección propuesta |
|---|---|---|---|
| **AU-01** | **HIGH** | **F0-2/02 §1.3:** `can_declare_8k = max_resolution ≥ 3840 ∧ nivel ≥ L183` ⇒ un master **4K con L183** se declara **8K** (upscale etiquetado), que **V-3 y 05 §5.4 prohíben**. El flag `uhd8k` es global ⇒ activarlo afecta a todos los 4K L183 | Umbral de fuente `≥ 7680` para la rama 8K (o emitir `-PREFERRED`, nunca `-RESOLUTION` real); añadir el caso «4K L183» a la matriz E5 §4.8 y a `uhd_doctrine_guard` |
| **AU-02** | MEDIUM | El cierre de t24 declara «9 FALSO y 5 IMPOSIBLE»; **PLAN §1 tiene 7 FALSO y 4 IMPOSIBLE** (la cifra 9/5 no está en el plan) | Corregir el conteo en el reporte; el plan no requiere cambio |
| **AU-03** | MEDIUM | F0-8 no migra los 15 consumidores de `/_ape/*` ni especifica si el token corre antes/después de `allow 127.0.0.1` | Enumerar consumidores y orden de gates; token obligatorio solo para mutación (`?v=`) y loopback exento |
| **AU-04** | MEDIUM | F0-11 no define clave de caché (riesgo de servir manifiesto con token ajeno) | Clave = `host + path + token-hash + UA`; TTL ≤3 s ya vetado |
| **AU-05** | LOW | G1 cita los scripts sin ruta; §7 sin `doc §`; F0-1 no lista consumidores de `health` | Añadir ruta `_vps_stage/edge/baseline/` y consumidores |
| **AU-06** | LOW | F0-6 no cubre el riesgo de parser estricto (TiviMate/OTT = NO_VERIFICADO) | Declarar el atributo como opcional y probar en 2 players antes de fijarlo |
| **AU-07** | INFO | Build FFmpeg e iGPU 21,9 fps: MEDIDO por el autor, **no reproducible en este host** (sin binario) | Marcar `[MEDIDO-AUTOR]` y no usarlo como gate |
| **AU-08** | INFO | F0-10 cambia el generador; G8 solo mide listas del VPS | Añadir gate de contenido de lista generada (canales sin probe: 0 con `CODECS=hvc1*`) — F0-10 ya lo declara como «cómo se mide» |

## 10. Veredicto global

**FAIL — no se declara PASS con un FAIL abierto.** Los 3 ejes del encargo se cumplen: `declare_auto` **se conserva** (PASS), el coste es **€0 en Fase 0** y €423 gateado en Fase 1 (PASS), y los gates son ejecutables con rollback (PASS, con G3/G4 re-ejecutados aquí). Lo que impide el PASS es **una contradicción de verdad en el núcleo del plan**: el endurecimiento de `declare_auto` deja viva la declaración «8K sobre 4K» que el propio plan veta (AU-01). Con el umbral corregido a `≥7680` (o marcando `-PREFERRED`) y AU-03/AU-04 resueltos, el plan pasa a PASS sin tocar `declare_auto` ni añadir coste.
