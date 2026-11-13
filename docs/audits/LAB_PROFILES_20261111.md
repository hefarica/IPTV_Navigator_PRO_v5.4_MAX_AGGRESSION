# §11 — PERFILES DEL LAB: descubrimiento, herencia y honestidad de la etiqueta 6K

**Fecha:** 2026-11-11 · **Autor:** canary-auditor (team `canary-jit-20261111`, task `t32`) · **HEAD:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e`
**Naturaleza:** SOLO LECTURA sobre los JSON del LAB. Datos en `docs/audits/LAB_PROFILES_20261111.json`.

> **Regla aplicada:** si un dato no está en el JSON, es `NO_COMPUTADO` con su razón. No se deduce de documentación externa ni se presenta como si estuviera en el JSON.

---

## 1. Inventario: 6 ficheros, 4 hashes, 3 copias byte-idénticas

| Clave | Ruta | Bytes | SHA-256 | Versión interna | `six_k_version` | Perfiles |
|---|---|---|---|---|---|---|
| A_CERTIFIED_DELIV | `deliverables/LAB_2026-10-26/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json` | 362.871 | `345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094` | `22.6.0-CERTIFIED-BULLETPROOF-2026-10-26` | — | 6 |
| B_CERTIFIED_VALID | `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json` | 362.871 | `345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094` | `22.6.0-CERTIFIED-BULLETPROOF-2026-10-26` | — | 6 |
| C_V23_FUSED | `artifacts/LAB_CALIBRATED_FINAL_v23.0.0-FUSED.json` | 332.256 | `59db06c8143c3445c6b0fe12c086e6529183afc72ccea23e2738755618f82711` | `22.6.0-CERTIFIED-BULLETPROOF-2026-10-26` | — | 6 |
| D_V24_6K | `artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json` | 586.587 | `71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30` | `23.1.0-6K-EMULATED` | `6K-EMULATED-v1` | 12 |
| E_IMPORTADO | `artifacts/LAB_CALIBRATED_IMPORTADO.json` | 605.082 | `63385ad8d88537f445002b5021fc28ead947758b13ceed2789f2be5670e59f8e` | `23.1.0-6K-EMULATED` | `6K-EMULATED-v1` | 24 |
| F_CERTIFIED_AUDIT | `audit_teams_REA/evidence/lab_master_22.6.0.CERTIFIED-BULLETPROOF-2026-10-26.json` | 362.871 | `345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094` | `22.6.0-CERTIFIED-BULLETPROOF-2026-10-26` | — | 6 |

**Byte-idénticos (mismo sha256, comprobado):** las **tres** copias de `LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json` —
- `deliverables/LAB_2026-10-26/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`
- `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`
- `audit_teams_REA/evidence/lab_master_22.6.0.CERTIFIED-BULLETPROOF-2026-10-26.json`

Es decir: el `CERTIFIED` está **triplicado** en el árbol (entregables ×2 + evidencia de auditoría), y las tres copias son el mismo fichero byte a byte. **No son tres versiones: es una.**

> El fichero `E_IMPORTADO` (605.082 B) **no estaba en la lista del encargo** pero es un JSON del LAB con la **misma** `version` interna (`23.1.0-6K-EMULATED`) y **24 perfiles** (los 12 P + 12 `crystal_*`). Se incluye porque ignorarlo dejaría fuera el mayor conjunto de perfiles del repo.

---

## 2. Estructura: dónde viven los perfiles

Los tres ficheros comparten el mismo esqueleto de 22-25 bloques. Los perfiles **no** están en `meta_per_profile` (ese bloque guarda fitness y hashes de las fuentes Excel/plantilla, no perfiles): viven en **`profiles_calibrated`**.

| Bloque | A_CERTIFIED | C_V23 | D_V24_6K |
|---|---|---|---|
| `profiles_calibrated` | object{6} | object{6} | object{12} |
| `meta_per_profile` | object{14} | object{14} | object{14} |
| `provenance_lab_final` | — | sí | sí |
| `emulated_6k` | — | — | sí |
| `six_k_version` | — | — | sí |
| `byterange_capability` | — | — | sí |
| `lab_version` | sí | sí | sí |
| `version` | sí | sí | sí |
| `nivel3_per_layer` | sí | sí | sí |
| `config_global` | sí | sí | sí |
| `placeholders_map` | sí | sí | sí |
| `servers` | sí | sí | sí |
| `certification_2026_10_26` | sí | sí | sí |

**Dónde está cada cosa:** `profiles_calibrated["<ID>"]` es el perfil; dentro, `settings`, `vlcopt`, `kodiprop`, `headerOverrides`, `hlsjs`, `bounds`, `fitness`, `optimized_knobs`, `player_enslavement`, `solver_trace`, `role` — y **solo en los perfiles derivados**: `level`, `quality`, `description`, `resolution`, `source_handling`, `emulation`, `compatibility`, `base_profile`, `is_emulated`, `declared_enhancement`.

---

## 3. Qué perfiles existen de verdad (sin renombrar ninguno)

| Fichero | IDs | Nº |
|---|---|---|
| `A_CERTIFIED_DELIV` / `B_CERTIFIED_VALID` / `F_CERTIFIED_AUDIT` | P0, P1, P2, P3, P4, P5 | 6 |
| `C_V23_FUSED` | P0, P1, P2, P3, P4, P5 | 6 |
| `D_V24_6K` | P0, P0.5, P1, P1.5, P2, P2.5, P3, P3.5, P4, P4.5, P5, P5.5 | 12 |
| `E_IMPORTADO` | P0, P0.5, P1, P1.5, P2, P2.5, P3, P3.5, P4, P4.5, P5, P5.5, crystal_2k_lite, crystal_2k_max, crystal_2k_uhd, crystal_4k_lite, crystal_4k_max, crystal_4k_uhd, crystal_6k_lite, crystal_6k_max, crystal_6k_uhd, crystal_8k_lite, crystal_8k_max, crystal_8k_uhd | 24 |

### 3.1 Corrección al enunciado del encargo

El encargo decía «no confundir **P0, P0.5, P1, P3, P4, P5**». Medido: **la escalera canónica del LAB es `P0, P1, P2, P3, P4, P5`** — existe **P2**, no P0.5, en el `CERTIFIED` y en `V23`. **`P0.5` no es un perfil canónico: es un derivado 6K** que solo existe en `D_V24_6K` y `E_IMPORTADO`.

Fusionar ambas listas sería el error que la §11 prohíbe. La escalera real es: **6 canónicos** + **6 derivados 6K** (P0.5, P1.5, P2.5, P3.5, P4.5, P5.5), cada derivado con su `base_profile`.

---

## 4. Tabla de perfiles (12, medidos del JSON del 6K)

| ID | Nombre | Resolución (REQUESTED) | fps | Códec | `base_profile` | Emulado |
|---|---|---|---|---|---|---|
| **P0** | 8K Master | `7680x4320` | 30 | `DVH1` | — | — |
| **P0.5** | 6K Emulated (P0) | `5760x3240` | 60 | `H265` | `P0` | true |
| **P1** | 4K UHD Pro | `3840x2160` | 60 | `HVC1` | — | — |
| **P1.5** | 6K Emulated (P1) | `5760x3240` | 60 | `H265` | `P1` | true |
| **P2** | 4K Balanced | `3840x2160` | 30 | `HVC1` | — | — |
| **P2.5** | 6K Emulated (P2) | `5760x3240` | 60 | `H265` | `P2` | true |
| **P3** | FHD 1080p | `1920x1080` | 60 | `HVC1` | — | — |
| **P3.5** | 6K Emulated (P3) | `5760x3240` | 60 | `H265` | `P3` | true |
| **P4** | HD 720p | `1280x720` | 30 | `HVC1` | — | — |
| **P4.5** | 6K Emulated (P4) | `5760x3240` | 60 | `H265` | `P4` | true |
| **P5** | SD 480p | `854x480` | 30 | `AVC1` | — | — |
| **P5.5** | 6K Emulated (P5) | `5760x3240` | 60 | `H265` | `P5` | true |

**Path JSON de cada dato** (el mismo patrón para los 12):

- `id` → `profiles_calibrated["<ID>"].id`
- `name` → `profiles_calibrated["<ID>"].name`
- resolución pedida → `profiles_calibrated["<ID>"].settings.resolution` (en los derivados también `profiles_calibrated["<ID>"].resolution`)
- fps → `profiles_calibrated["<ID>"].settings.fps`
- códec → `profiles_calibrated["<ID>"].settings.codec` (+ `settings.codec_full`)
- padre → `profiles_calibrated["<ID>"].base_profile`
- emulación → `profiles_calibrated["<ID>"].is_emulated`, `...declared_enhancement`, `...emulation`, `...quality`

Ejemplo literal, `P0.5`:

```json
{
 "id": "P0.5",
 "name": "6K Emulated (P0)",
 "level": 0.5,
 "quality": "6K_EMULATED",
 "resolution": "5760x3240",
 "base_profile": "P0",
 "is_emulated": true,
 "declared_enhancement": true
}
```

### 4.1 Contradicción medida dentro del mismo perfil: `bit_depth` vs `bitDepth`

El mismo perfil declara **dos** profundidades de bit con **claves distintas y valores distintos**:

| ID | `settings.bit_depth` | `settings.bitDepth` | ¿Coinciden? |
|---|---|---|---|
| P0 | 10 | "12" | **NO** |
| P0.5 | 10 | "12" | **NO** |
| P1 | "10" | "10" | sí |
| P1.5 | 10 | "10" | sí |
| P2 | "10" | "10" | sí |
| P2.5 | 10 | "10" | sí |
| P3 | "10" | "8" | **NO** |
| P3.5 | 10 | "8" | **NO** |
| P4 | "8" | "8" | sí |
| P4.5 | 10 | "8" | **NO** |
| P5 | "8" | "8" | sí |
| P5.5 | 10 | "8" | **NO** |

En **6 de 12** perfiles los dos campos no coinciden (`P0` y `P0.5` dicen `10` y `"12"` a la vez; `P3`, `P3.5`, `P4.5` y `P5.5` dicen `10` y `"8"`). Y el propio fichero documenta en `provenance_lab_final.corrections_not_rescues.c1_dv8_bit_depth_10` que *«declarar 12 era una etiqueta falsa»*: la corrección se aplicó a **una** de las dos claves y la otra quedó con el valor viejo. **No es un tecnicismo: es una etiqueta falsa viva en el fichero.**

---

## 5. Las cuatro resoluciones: SOURCE / REQUESTED / PROCESSED / DISPLAY

| ID | SOURCE | REQUESTED | PROCESSED | DISPLAY |
|---|---|---|---|---|
| P0 | **NO_COMPUTADO** | `7680x4320` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P0.5 | `7680x4320` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P1 | **NO_COMPUTADO** | `3840x2160` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P1.5 | `3840x2160` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P2 | **NO_COMPUTADO** | `3840x2160` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P2.5 | `3840x2160` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P3 | **NO_COMPUTADO** | `1920x1080` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P3.5 | `1920x1080` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P4 | **NO_COMPUTADO** | `1280x720` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P4.5 | `1280x720` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P5 | **NO_COMPUTADO** | `854x480` | **NO_COMPUTADO** | **NO_COMPUTADO** |
| P5.5 | `854x480` | `5760x3240` | **NO_COMPUTADO** | **NO_COMPUTADO** |

**Qué falta y por qué (esto es el corazón de la §11):**

| Columna | Estado | Razón medida |
|---|---|---|
| **SOURCE** | presente **solo en los 6 derivados** (`source_handling.source_resolution` = `7680x4320`); **NO_COMPUTADO en P0..P5** | los perfiles base no tienen `source_handling`: el LAB no declara de qué fuente sale cada perfil canónico |
| **REQUESTED** | presente en los 12 (`settings.resolution`) | es la resolución que el perfil pide |
| **PROCESSED** | **NO_COMPUTADO en los 12** | el JSON **no tiene ninguna clave** `processed`/`output`/`rendered`: el barrido de `/process|output|render|effective/` sobre las claves devuelve **0**. Y no es un olvido: `emulation.apply="device_vpp_declared"` + `emulation.declared_not_applied_by_vps=true` **declaran que no se aplica en el VPS** |
| **DISPLAY** | **NO_COMPUTADO en los 12** | `compatibility.min_display`/`max_display` son **requisitos de compatibilidad** (qué display hace falta), no una resolución de display **medida** |

**Lección:** el JSON distingue perfectamente lo que pide de lo que declara aplicar — pero **no existe un solo campo que afirme «procesado»**. Quien lea `resolution: "5760x3240"` como «salida efectiva 6K» está leyendo REQUESTED como PROCESSED. Eso es exactamente la mentira que la §11 prohíbe.

---

## 6. Herencia: padre declarado, hash del padre NO_COMPUTADO

Los 6 derivados **sí** guardan su padre, en un campo estructurado:

| Hijo | Padre (`base_profile`) | Path | sha256 del padre |
|---|---|---|---|
| P0.5 | **P0** | `profiles_calibrated["P0.5"].base_profile` | **NO_COMPUTADO** |
| P1.5 | **P1** | `profiles_calibrated["P1.5"].base_profile` | **NO_COMPUTADO** |
| P2.5 | **P2** | `profiles_calibrated["P2.5"].base_profile` | **NO_COMPUTADO** |
| P3.5 | **P3** | `profiles_calibrated["P3.5"].base_profile` | **NO_COMPUTADO** |
| P4.5 | **P4** | `profiles_calibrated["P4.5"].base_profile` | **NO_COMPUTADO** |
| P5.5 | **P5** | `profiles_calibrated["P5.5"].base_profile` | **NO_COMPUTADO** |

**Por qué el sha256 del padre es `NO_COMPUTADO` y no se inventa:** el LAB **no guarda un hash por perfil**. Guarda hashes a nivel de **fichero fuente**, en `provenance_lab_final.sources`:

| Fuente declarada | Fichero | Bytes | SHA-256 declarado | ¿Existe en disco con ese nombre? |
|---|---|---|---|---|
| crystal | `LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` | 280.065 | `099a1707a2f1ae692ffcfede01165f21cd66656b786742ce8db518581a371fd4` | 0 copias (ver §7) |
| memc | `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json` | 423.609 | `279e45960550a15927658ef3e082deb150e148dc0fb748de1d3a51d47b56f017` | 0 copias (ver §7) |
| certified | `LAB_CALIBRATED_BULLETPROOF_20261026_015604.json` | 362.871 | `345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094` | 0 copias (ver §7) |

**Lo que sí se puede encadenar con hash real:** el `certified` declarado por el 6K (`345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094`, 362.871 B) **es byte-idéntico** al `CERTIFIED` que medí en §1 (`345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094`). Es decir: **la cadena a nivel de FICHERO está probada**; lo que no existe es la cadena a nivel de perfil.

**Qué haría falta para tener el sha256 del padre:** un campo por perfil (p. ej. `base_profile_sha256`) o un hash canónico del subárbol `profiles_calibrated["<ID>"]` (JCS/RFC 8785 + SHA-256). Hoy no está: **NO_COMPUTADO**.

---

## 7. Auditoría 6K

### 7.1 Aviso 1 — nombre de fichero vs nombre interno: **SOPORTADO**

| Campo | Valor |
|---|---|
| Nombre de fichero | `LAB_CALIBRATED_FINAL_v24.0.0-6K.json` |
| `version` (path `version`) | **`23.1.0-6K-EMULATED`** |
| `six_k_version` (path `six_k_version`) | **`6K-EMULATED-v1`** |

El fichero se llama **v24.0.0** y dentro dice **v23.1.0**. La discrepancia es real y está en el campo `version`, no en un comentario.

### 7.2 Aviso 2 — «dos geometrías 6K conviviendo»: **NO SOPORTADO**

| Número | Ocurrencias en `D_V24_6K` | ¿Es geometría del LAB? |
|---|---|---|
| `5790` | **0** | **NO** — no existe en ningún JSON del LAB |
| `6144` | **0** | **NO** |
| `3456` | **0** | **NO** |
| `5760` | **67** | **SÍ** — la única geometría 6K del LAB |
| `3240` | **63** | **SÍ** |

**Geometría 6K declarada, una sola:** `emulated_6k.target_resolution = "`5760x3240`"`, replicada en **69 paths** del JSON.

**Dónde sí aparecen `5790x3240` y `6144x3456`** (ninguno es dato del LAB):

- artifacts/ape-omega-integracion/bundle/index.js:1307 (prosa de un plugin: "5790x3240 y 6144x3456 son geometrias distintas")
- .agents/skills/iptv-ape-apk-vps-contract-alignment/SKILL.md:324 ("El JIT legado del VPS es OTRO dominio: su modo opt-in es 6144x3456, distinto del 5760x3240")
- .agent-teams/canary-jit-20261111/team.json:3998,4016 (el propio enunciado de la tarea)

La skill `iptv-ape-apk-vps-contract-alignment` lo dice con claridad: `6144x3456` es el modo opt-in del **JIT legado del VPS**, **otro dominio**, *«distinto del `5760x3240` de…»* el LAB. Y `5790` **no aparece en ningún artefacto de datos del repo**: es un **typo por 5760**.

**Conclusión del aviso 2:** no hay dos geometrías conviviendo en el LAB. Hay **una** (5760x3240) y **dos números de prosa** de otro dominio. Reportarlo como «conviven» habría sido aceptar una premisa falsa.

### 7.3 Veredicto de la etiqueta 6K: **HONESTA, con ambigüedad nominal**

| Comprobación aritmética | Declarado | Calculado | ¿Cuadra? |
|---|---|---|---|
| `emulated_6k.pixel_count` | 18.662.400 | 5760 × 3240 = 18.662.400 | **sí** |
| `vs_4k_ratio` | 2.25 | 2.25 | **sí** |
| `vs_8k_ratio` | 0.5625 | 0.5625 | **sí** |
| downsample 0.75 de la fuente | `5760x3240` | 7680×0.75 = 5760 · 4320×0.75 = 3240 | **sí** |

**Por qué HONESTA** — el fichero declara la emulación en **cinco** sitios y en ninguno dice que la fuente sea 6K:

1. `emulated_6k.truth` = *"DECLARED_ENHANCEMENT — nunca se declara la fuente como 6K real"*
2. `emulation.declared_not_applied_by_vps` = `true`
3. `is_emulated` = `true` y `declared_enhancement` = `true` en los 6 derivados
4. `quality` = `6K_EMULATED`
5. `P0.5.description` = *"Variante 6K emulada de P0 — 5760x3240 por 8k_downsample_lanczos_0.75. Declarado como enhancement de display, nunca como fuente real."*

**Por qué AMBIGUA (nominal, no factual)** — «6K» sin geometría **no es un estándar**: DCI 6K es `6144x3240` y el 16:9 UHD de 5760 es `5760x3240`. El fichero resuelve la ambigüedad fijando **5760x3240** en 69 paths y nombrando el producto `6K-EMULATED-v1`, así que **no engaña a quien lo lee completo**; pero la etiqueta suelta «6K» sí invita a confusión con DCI.

**Lo que la etiqueta NO es: falsa.** No hay ni un campo que afirme fuente 6K, ni salida 6K efectiva, ni aplicación en el VPS. Comparado con el estándar de la §11 («no convertir la etiqueta comercial 6K/8K en una declaración falsa de salida efectiva»), **el JSON cumple**: separa REQUESTED de PROCESSED y deja PROCESSED vacío en vez de mentirlo.

---

## 8. Hallazgo colateral que el encargo no pedía y conviene no perder

`provenance_lab_final.refused` documenta que el LAB **ya rechazó** dos etiquetas imposibles: `fps_120` (*«CRYSTAL y MEMC declaran fps=120 en los 6 perfiles: imposible»*) y `chroma_serial` (*«168055555555556: es un serial de Excel, no un valor de croma»*). Y `pending` deja abierto:

> *"P2: settings.resolution=3840x2160 pero X-APE-RESOLUTION empieza en 2560x1440. La cascada no alcanza la resolucion del perfil."*

Eso es una **incoherencia viva** entre lo que el perfil pide (`REQUESTED`) y la cascada que declara en `headerOverrides`. No la arreglo (solo lectura), la señalo.

---

## 9. NO_COMPUTADO, con su razón

| Afirmación | Estado | Razón |
|---|---|---|
| sha256 del **perfil padre** en la herencia | **NO_COMPUTADO** | el LAB no guarda hashes por perfil; solo por fichero fuente |
| **PROCESSED** resolution de cualquier perfil | **NO_COMPUTADO** | no existe clave que la declare; el fichero dice explícitamente que no se aplica en el VPS |
| **DISPLAY** resolution real | **NO_COMPUTADO** | `compatibility.min_display`/`max_display` son requisitos, no medidas |
| **SOURCE** de P0..P5 | **NO_COMPUTADO** | solo los derivados tienen `source_handling` |
| Existencia en disco de los 3 ficheros fuente de `provenance_lab_final` | **0 copias con ese nombre exacto** | barrido recursivo por nombre: `CRYSTAL-4K-UHD.json`, `MEMC-TOTAL-8K120-DNR.json` y `LAB_CALIBRATED_BULLETPROOF_20261026_015604.json` → 0. El **contenido** de `certified` sí existe (mismo sha256, otro nombre) |
| Aplicación real de la emulación 6K en un device | **NO_COMPUTADO** | sin dispositivo ni telemetría; `apply="device_vpp_declared"` es declaración |
| Que `5760x3240` sea «más 6K» que `6144x3240` | **NO_COMPUTADO** | cuestión de convención, no de dato |

---

## 10. Reglas que se respetaron

1. **Solo lectura** sobre los 6 JSON: no se escribió ni un byte de ninguno (hashes de §1 medidos antes y después del trabajo).
2. **Ningún perfil fusionado ni renombrado:** se listan los 12 del 6K y los 6 canónicos tal como aparecen en `profiles_calibrated`.
3. **Ningún número sin artefacto:** cada cifra de este informe sale de un path JSON citado o de un `sha256` medido.
4. **Lo que no está, es NO_COMPUTADO** con su razón (§9), nunca deducido de la documentación.
