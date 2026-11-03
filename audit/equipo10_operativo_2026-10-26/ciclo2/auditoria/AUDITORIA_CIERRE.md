# AUDITORÍA DE CIERRE — Ciclo 2 (t17) · ¿cerraron los 3 HIGH?

**Auditor:** `s9-player-compat` · **Fecha:** 2026-10-27 · **Snapshot vigente:** `d81ddb3aa4badab054db3344b2b201d0663c4566`
**Blob del generador:** `b7b594467c6ebc2df61b01515bbc288b3a0ee570` = **741.881 B / 11.688 L** (verificado: `git rev-parse HEAD:<path>` + `git cat-file -s` + `ReadAllLines` del blob congelado = idéntico).
**Snapshot auditado en ciclo 1:** `e38a89b` / `c1277bdf` / 11.144 L. **git status:** 50 = 11 M / 3 D / 36 ??.
**CoI declarado:** soy autor del capítulo **S9**. Aquí **no** valido S9; solo verifico el **token literal** de su fila `S9:96` como insumo del conteo (el contenido lo validó el capitán). No soy autor de ninguna corrección de ciclo 2.

## 1. Método y límites
Read-only. Re-ejecuté comandos y releí líneas del **blob congelado `d81ddb3`** (nunca el WT vivo). No ejecuté `run_checks.ps1` (escribe sus salidas); releí sus JSON y re-ejecuté los comandos muestreados. Sin VPS, sin dispositivo, sin ejecutar el generador. **20 anclas + 12 afirmaciones = 32 verificaciones.**

## 2. AUD-01 — citas de S1 sin ancla real → **CERRADO**

Muestreo de 20 anclas del blob `b7b59446` (comando: `ReadAllLines` + `[regex]::Matches`; exit 0 en todos):

| Ancla | Contenido medido | Cita que la reemplaza | ¿Coincide con la corrección? |
|---|---|---|---|
| **226** | `lines.findIndex(... startsWith('#EXT-X-MEDIA-SEQUENCE'))` | `:10147` (F14) | **SÍ** (y 0 emisiones) |
| **2664 / 3001 / 3053** | `#EXT-X-VERSION:9` (3 ocurrencias) | `:12930` (F11) | **SÍ** |
| **3042** | `#EXT-X-VERSION:7` (modo MAX-COMPAT) | — | **SÍ** |
| **3004 / 3005 / 3006** | `TARGETDURATION:2` · `PART-INF` · `SERVER-CONTROL` contiguos | `:2626-2628` (F12) | **SÍ** |
| **3032** | `DATERANGE` **sin** `START-DATE` | `:2654` (F15) | **SÍ** |
| **3080 / 3081** | `DATERANGE` **con** `START-DATE` | — | **SÍ** |
| **3079** | `I-FRAME-STREAM-INF:BANDWIDTH=450000,…,RESOLUTION=1920x1080` — **sin `URI=`** (línea completa verificada) | `:13008` / `:2701` (F09) | **SÍ** (2 sitios, 0 con `URI=`) |
| **10005** | `lines.push(I-FRAME-STREAM-INF:BANDWIDTH=…,CODECS=…)` — sin `URI=` | `:19941` / `:9634` (F09) | **SÍ** |
| **6885 / 6890 / 6895** | `hdcpLevel = cfg.hdcp_level \|\| 'NONE'` | — | **SÍ** |
| **6910** | `STREAM-INF` con `HDCP-LEVEL=${hdcpLevel}` (parametrizado) | `:6538` (F16) | **SÍ** (PARCIAL) |
| **10157** | `_hdcpMap[_hdcpChId] \|\| 'TYPE-1'` (hardcode superviviente) | `:6538` (F16) | **SÍ** |
| **7163 / 8026** | `#EXTINF:-1` | `:6791` / `:7655` (F13) | **SÍ** |
| **2687 / 2927** | `_RFC_SINGLETONS = Set(['#EXT-X-INDEPENDENT-SEGMENTS','#EXT-X-VERSION','#EXTM3U'])` | `:2547-2566` (F20) | **SÍ** |
| **`ape-fallback-resolver.js:612`** | `return '#EXT-X-STREAM-INF:'+parts.join(',')` | `:612` | **SÍ** (coincide tal cual) |
| **1.284 / 1.177** | tokens `#EXT[A-Z0-9-]*` distintos / con `APE-` | F02 | **SÍ** (reproducido exacto) |

**Citas «ajenas» confirmadas:** en `d81ddb3` `:2701` = comentario, `:9634` = `// 8.w — CORTEX TELEMETRY`, `:10147` = `_pqMapLeg`, `:6538` = `#EXT-X-APE-AUDIO-DYNAMIC-RANGE:20dB` ⇒ los 4 números existen con contenido distinto al citado, como declaró la corrección. `:12930/:13008/:19941` **no existen** en 11.688 L.
**Veredicto AUD-01: CERRADO.** 7/7 re-ancladas; 20/20 anclas verificadas; sustancia 6/7 + F16 PARCIAL (declarado). Única objeción: **CIERRE-04** (denominador de V5).

## 3. AUD-02 — alcance histórico + SIN_BLOB → **CERRADO**

- `HISTÓRICO_NO_REPRODUCIBLE` declarado para 14 coordenadas, incluido el comentario `:7665-7667`: **verificado ausente** del blob nuevo (búsqueda textual = 0).
- **SIN_BLOB (hallazgo nuevo) verificado con comando propio:** `git cat-file -e` → **exit 128 en `e38a89b` y en `d81ddb3`** para los 4 archivos (`audit_bulletproof_output.m3u8`, `backend/lista_omega_v5.4.m3u8`, `…pre-admission.js`, `…_BACKUP_PRE_USA.js`). Las **9 mediciones** enumeradas (F03/F06/F07/F08/F09-10/10/F10/F15/F18/F22) coinciden en número con la lista.
- El artefacto **existe en disco** y lo re-medí: **459.587 B / 9.315 L / mtime 2026-05-11**, `VERSION:9`×1, `SUPPLEMENTAL-CODECS`×10, `lcev.1.1.1`×10, `I-FRAME`×10, `EXTINF`×10 ⇒ es re-medible hoy, no evidencia de commit.
**Veredicto AUD-02: CERRADO** (alcance acotado y etiquetado, sin ambigüedad).

## 4. AUD-03 — scorecard v2 = 49 y PASS calificados fuera → **CERRADO**

Verificación programática (`ConvertFrom-Json` + suma de filas, exit 0):

| Dim | pass/fail/blocked/not_run | Σ | binarios | calif. | declarados | ¿blob declarado? |
|---|---|---|---|---|---|---|
| S1 | 8/12/0/2 | 22 | 22 | 0 | 22 | sí |
| S2 | 4/5/1/2 | 12 | 12 | 0 | 12 | sí |
| S3 | 15/12/0/5 | 32 | 32 | 0 | 34 | sí |
| S4 | 8/11/0/4 | 23 | 23 | 0 | 24 | sí |
| S5 | 0/15/0/0 | 15 | 15 | 0 | 15 | sí |
| S6 | 8/3/0/0 | 11 | 11 | 1 | 12 | sí |
| S7 | null | — | — | — | 0 | sí (sin tabla) |
| S8 | 4/3/0/0 | 7 | 7 | 2 | 9 | sí |
| S9 | 1/3/1/1 | 6 | 6 | 2 | 8 | sí + `blob_validado` |
| S10 | 1/4/0/1 | 6 | 6 | 2 | 8 | sí |
| **Σ** | **49/68/2/15** | **134** | **134** | **7** | **144** | 9/9 |

- Totales del JSON = suma de filas = suma de los **5 grupos por blob** = **49/68/2/15/134** ⇒ **coincide con la ratificación del capitán**. **0 discrepancias.**
- Regla anti-suavizado explícita (`regla_1`/`regla_2` + `tokens_calificados_detectados`); S8 y S10 ya no suman sus calificados.
- **La fila `S7_S10:151` es de S10, no de S7**: sección `## 7. S10 · Superficie de auth` (encabezado en **L145**, tabla L147-156) ⇒ el retiro del PASS de S10 (2→1) es legítimo y **no hay doble resta**; S7 nunca aportó (null). Base de la ratificación **verificada**.
- Denominadores: 53+68+2+15=**138** (crudo v1) · 51+68+2+15=**136** (base 51) · 49+68+2+15=**134** (ratificado). `ERRATA:71` los distingue; **el documento no los confunde**.
**Veredicto AUD-03: CERRADO.** Objeción: la documentación obligatoria aún publica 51 (**CIERRE-02**).

## 5. Muestreo de afirmaciones de las correcciones (comando + exit)

| # | Afirmación | Verificación | Resultado |
|---|---|---|---|
| 1 | `SCORECARD_v2` parsea y suma 49 | `ConvertFrom-Json` + suma de 10 dimensiones y 5 grupos | **CONFIRMADO** (exit 0) |
| 2 | `AUD-01_02_ANCLAS.md` sha256 `2656921d…` | `Get-FileHash` | **CONFIRMADO** |
| 3 | `SCORECARD_v2.json` sha256 `6099bd7e…` | idem | **CONFIRMADO** |
| 4 | `ERRATA_ARITMETICA.md` `4994a769…` · `MEDICION` `017dca84…` · `DELTA` `532a1de4…` · `SNAPSHOT_2026-10-27` `5e5b4540…` · HARNESS A `8e1d108a…` · HARNESS B `a806b87b…` | idem (8/8) | **CONFIRMADO** |
| 5 | Corrida A = exit 1 · 9/11/1; corrida B = exit 1 · 10/10/1 | lectura de ambos HARNESS | **CONFIRMADO** |
| 6 | `C05` 57→50 (11 M/3 D/36 ??) · `C10` 9→10 · `C19` FAIL por congelado de ciclo 1 | filas del HARNESS B | **CONFIRMADO** |
| 7 | WT == HEAD (solo EOL) | WT normalizado a LF → `sha256 594b3848…` = idéntico al blob | **CONFIRMADO** |
| 8 | generador ya no está `M` | `git status --porcelain -- <gen>` → 0 líneas | **CONFIRMADO** |
| 9 | S5 sigue ABIERTO en `d81ddb3` (`:6080/:6281/:9007/:9009/:9011/:9022/:9306/:9307/:9636/:9639`, `:6086` endpoint ajeno; `:5276/:5404-5406/:6172/:7033` nuevos) | lectura del blob | **CONFIRMADO** (16/16) |
| 10 | `conviva_qoe_server.php` sin cambios en el rango | `git rev-parse` en ambos revs = `c6189d72` | **CONFIRMADO** |
| 11 | `computeStubQoE` `:210`, `return 40` `:222`, `return 25` `:228`, `??75` `:231`; `ape_mesh` `:113-115/:132/:181` | lectura de ambos PHP | **CONFIRMADO** |
| 12 | `t14` #4: `:9880` «NO VERIFICABLE» | `drAttrs` (9870-9878) **nunca** empuja `START-DATE` | **DESMENTIDO parcial** (**CIERRE-04**) |

## 6. Vigencia del paquete del 26-oct con `d81ddb3`

| Elemento del paquete | Estado hoy | Acción |
|---|---|---|
| Veredictos por dimensión (9 tablas) | **SIGUEN VÁLIDOS** (S1 FAIL·S2 FAIL·S3 WARN·S4 WARN·S5 FAIL·S6 PASS_COND·S7 WARN/BLOCKED·S8 WARN·S9 FAIL·S10 FAIL) | mantener |
| Conteo | **HISTÓRICO**: 53 (v1) → **49 ratificado** (v2) | usar `SCORECARD_v2` |
| `H02/H03` («HEAD byte-idéntico a producción en 2 fases») | **INVERTIDO**: en `d81ddb3`, `ape_header.lua`=**8.088 B `23b25b03`** y `ape_uri_rebase.lua`=**9.930 B `393635c2`** vs prod 2.210 B `a15e1fe3` / 6.043 B `1d456a46`; solo `ape_wake_on_manifest`=2.284 B `d9c6b65d` idéntico | **re-emitir**; `RIESGOS_TOP §3` fila «descartado» es hoy **falsa** (**CIERRE-05**) |
| `X1/X2` del consolidado («HEAD==prod; el WT es el desvío») | **HISTÓRICO**: el WIP se commiteó | declararlo en el consolidado |
| Coordenadas del generador (`c1277bdf`, 11.144 L) | **HISTÓRICAS** para el emisor (ahora `b7b59446`, 11.688 L) | usar `AUD-01_02_ANCLAS` |
| S6 (`WT 23b25b03/393635c2`) | esos blobs **son ahora HEAD** ⇒ los hallazgos de S6 aplican a HEAD | coordinar como `HEAD d81ddb3` (**CIERRE-06**, INFO) |
| Artefacto `audit_bulletproof_output.m3u8` | **EXISTE** (untracked) con `VERSION:9`×1 y `lcev`×10 | `ABIERTO_ARTEFACTO_NO_VERSIONADO` (**CIERRE-01**) |
| Resto de hallazgos (tóxicos 72+6, secretos 9, QoE fabricada, `wg0.conf`) | **SIGUEN** (C11-C16 idénticos + S5 re-verificado) | backlogs del 26-oct vigentes |

## 7. Corrección del capitán sobre `t14` — verificada por mí

`MEDICION_2026-10-27.md:71` afirma que el artefacto «no existe en HEAD ni en disco» y cierra `VERSION:9` «por desaparición». **Refutado:** `Test-Path` = **True**, 459.587 B, mtime 2026-05-11, y los conteos del capitán coinciden exactamente. `:82` («2 CERRADOS») queda corregido a **1 CERRADO (SUPPLEMENTAL-CODECS/lcev en el emisor, 0 en `b7b59446`) + 1 ABIERTO (artefacto)**. El error de t14 es de **método** (`Get-ChildItem -Filter *bulletproof*` no cubrió la ruta real `IPTV_v5.4_MAX_AGGRESSION/`), no de intención.

## 8. Hallazgos nuevos (detalle en `CIERRE.json`)

| ID | Sev | Hallazgo |
|---|---|---|
| **CIERRE-01** | **HIGH** | `t14` cerró `VERSION:9` por una premisa **falsa** (artefacto existente). Veredicto correcto: **ABIERTO_ARTEFACTO_NO_VERSIONADO**. Ya corregido por el capitán (Apéndice 2) y **verificado con comando propio** |
| **CIERRE-02** | **MEDIUM** | La documentación obligatoria sigue en **51/136**: `.claude/commands/equipo-10-adn.md:62,107,163` y `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md:57,103` contradicen la ratificación **49/134** |
| **CIERRE-03** | **MEDIUM** | `X1/X2` invertido: el paquete del 26-oct afirma HEAD==producción y hoy HEAD diverge en 2 de 3 fases. `H02/H03` y la fila «descartado» de `RIESGOS_TOP §3` son **falsas en `d81ddb3`** |
| **CIERRE-04** | **LOW** | `AUD-01_02_ANCLAS.md:33` (V5) declara «1 de 3 plantillas sin `START-DATE`» y `t14:74` marca `:9880` «NO VERIFICABLE»: medido, hay **2 de 4 sitios sin `START-DATE`** (3032 y 9880) y `:9880` **sí** es determinable (`drAttrs` 9870-9878 no añade `START-DATE`) |
| **CIERRE-05** | **INFO** | `SCORECARD_v2` etiqueta S6 como «WT congelado `23b25b03`/`393635c2`»; esos sha256 **son ahora el HEAD `d81ddb3`** ⇒ la etiqueta debe subir a HEAD (no cambia números) |
| **CIERRE-06** | **INFO** | El contexto (§4) y el README del 26-oct siguen citando anclas de `e38a89b` (`:2764/:9617/:2355/:2690/:2740`) sin marcarlas históricas; bajo `d81ddb3` esas líneas ya no son esas |

## 9. Veredicto por HIGH y estado del paquete

| HIGH | Veredicto | Base |
|---|---|---|
| **AUD-01** | **CERRADO** | 7/7 re-ancladas + 20/20 anclas verificadas + histórico declarado |
| **AUD-02** | **CERRADO** | histórico acotado + 4 SIN_BLOB (exit 128 en ambos revs) + 9 mediciones enumeradas |
| **AUD-03** | **CERRADO** | 49/68/2/15=134 verificado por suma de filas y de grupos; calificados fuera; fila `S7_S10:151` en S10 |

**3/3 HIGH cerrados.** Pero el **paquete no es re-certificable como PASS** todavía: queda **1 HIGH nuevo** (CIERRE-01, artefacto no versionado con `VERSION:9`/`lcev`), **2 MEDIUM** (docs en 51; X1/X2 invertido) y 1 LOW. El producto sigue con las violaciones RFC de S1 abiertas en el emisor vigente (`VERSION:9` en 2664/3001/3053, `I-FRAME` sin `URI=` en 3079/10005, `TARGETDURATION`+`PART-INF`+`SERVER-CONTROL` en 3004-3006): cerrar trazabilidad no cierra producto.

## 10. No verificado (declarado)
`nginx -t`/VPS/`systemd`/`adb` = **NOT_RUN/BLOCKED** (host Windows, `iptv-vps-touch-nothing`). Reproducción en dispositivo = **NOT_RUN**. Ejecución del generador y parseo con hls.js/ffprobe = **NOT_RUN**. Explotabilidad de endpoints = prohibida. No edité ninguna corrección ajena; solo escribí `ciclo2/auditoria/`.
