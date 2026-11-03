# RE-AUDITORÍA DEL PLAN REA v2 (t27) — cierre de AU-01..AU-08

**Auditor:** `s9-player-compat` · **Fecha:** 2026-10-27 · **Snapshot:** `git HEAD a8ff0e9`
**Recusación:** sigo siendo autor de `05_PLAYER_COMPAT.md` ⇒ **no lo valido** (lo valida el capitán). Audito `PLAN_REA.md` v2, `02` v2, `ERRATA_AU.md`, `01/03/04/AUDITORIA_PLAN_REA` y las correcciones.
**Integridad (recomputada):** `PLAN_REA.md` **200 L · 27.830 B · `79b32cb2a0d47731…`** · `02` **220 L · 21.791 B · `a2577d2e8d146cb5…`** · `ERRATA_AU.md` **46 L · 6.684 B · `01b8d625599b0ed5…`** · `01` `e6872b48…` · `03` `f8989348…` · `04` `157f3222…` · `05` `bdde76fe…` · `AUDITORIA_PLAN_REA.md` `70fa21cf…` ⇒ **coinciden con la tabla de `ERRATA_AU.md` §3**; los 4 docs que debían quedar intactos lo están.
**Criterio vinculante:** la RATIFICACIÓN DEL CAPITÁN sobre AU-01 (doctrina LOCKED conservada; marcador obligatorio; nunca `-REAL`; caso en matriz y V-3; guard blocker/info). No aplico el umbral `≥7680` que propuse.

## 1. Veredicto por hallazgo

| ID | Veredicto | Evidencia re-verificada |
|---|---|---|
| **AU-01** excepción de producto | **FAIL (parcial)** | `can_declare_8k = (uhd8k=1) AND (nivel ≥ L183)` **PASS** (`PLAN:64`, `02:43`); marcador `src=`/`declared=7680`/`can8k=1` + **nunca `-REAL`** **PASS** (`PLAN:65-67`, `02:44-47`, `02:73`); V-3 como **excepción declarada** **PASS** (`PLAN:144`); doctrina intacta (`PLAN:6,61,73`) **PASS**; **caso «4K L183 → 8K (producto, marcado)» en la matriz: FAIL** — `02 §1.3` no tiene matriz de casos (solo flags `:25-31` + fórmula `:39-48` + notas `:50-53`); la matriz real está en `docs/edge/E5_UHD_DOCTRINE.md §4.8` (`:270-276`, 5 filas) y **tampoco incluye 4K L183** (su fila 4K es solo L153); §4.2 (M1-M7) idem. **AU-01b** |
| **AU-02** recuento | **PASS** | Conteo por fila de `PLAN §1` (`:24-55`): **32 filas = 13 REAL · 8 POSIBLE · 4 IMPOSIBLE · 7 FALSO** — idéntico al auditado; el encabezado `:20` desmiente «9/5» |
| **AU-03** F0-8 auth | **PASS** (con **AU-09**) | Los **16** enumerados existen y **todos** referencian `/_ape/` (12 llamadores + 4 handlers; verificado 16/16, 0 sin referencia). Orden de gates (loopback → token solo mutación → 403 fail-closed → no 443) y regla «sin migración no se publica» (`PLAN:84-88`). La cifra 15 del auditor era otro criterio (archivos con el string); declarado |
| **AU-04** clave de caché | **PASS** | `host|path|args_ordenados|cred=sha256_16`, credenciales **nunca en claro**, bypass si no aísla, nunca no-200, TTL ≤3 s (`PLAN:92-96`) |
| **AU-05** F0-6 `STABLE-VARIANT-ID` | **PASS** (con **AU-10**) | `frontend/js/ape-v9/parsers/**` = **0** ocurrencias; 4 archivos/13 ocurrencias en repo (2 emisores, 1 vendor, 1 test) — no en parsers. Flag `stable_var_id=0` por defecto + prueba en 2 players antes de activar (`PLAN:77`) |
| **AU-06** F0-10 gate de lista | **PASS** | Gate (a) 0 canales sin probe con `CODECS=hvc1*`; (b) diff contra última lista; (c) `node -c` ×3; límite honesto sobre listas cacheadas (`PLAN:90`) |
| **AU-07** build/iGPU | **PASS** | Etiqueta `[MEDIDO-AUTOR] NO_VERIFICADO` en cabecera (`PLAN:11`), §3 (`:111-115`) y epílogo (`:200`); «no vale como gate» explícito |
| **AU-08** G1/G8 | **PASS** | G1 con rutas reales (`phase0_backup.sh` 5.086 B, `phase0_verify.sh` 2.174 B, logs) y G2 `restore_phase0.sh` 3.402 B; G8 exige capturar `lists_baseline.txt` antes y declara que **hoy no existe** (GAP) (`PLAN:159-160,167`) |
| Integridad / errata | **PASS** | `ERRATA_AU.md` §1 mapea los 8 hallazgos (con doble numeración) y §3 declara antes/después; 4 docs intactos confirmados. Objeción: la errata afirma que el caso 4K-L183 se añadió a la matriz de `02 §1.3` — **no es cierto** (AU-01b) |
| Coste | **PASS** | Fase 0 = **€0**; único importe **€423,00 1.er mes** GEX45 (`PLAN:109`) gateado; `€4,76/slot` es derivado del mismo importe, no compra nueva |
| `declare_auto` vivo | **PASS** | `PLAN:6,61,73`; F0-2 solo acota; V-4 lo protege; la excepción 8K está **documentada**, no oculta |
| Cero ficción / secretos | **PASS** | 0 PEM / `PrivateKey`/`PresharedKey`/`user:pass@`/token literal; 0 CV/experiencia/PhD. Los hits «CV/cert» son patrones de este propio barrido y «Licencia/CM de Dolby» |
| **GLOBAL** | **FAIL** | 2 abiertos: **AU-01b** (matriz) y **AU-09** (contradicción real_ip/E5-F3) |

## 2. Hallazgos nuevos de esta re-auditoría

| ID | Sev | Hallazgo | Corrección |
|---|---|---|---|
| **AU-01b** | **HIGH** | El criterio del capitán exige el caso «4K L183 → 8K (producto, marcado)» **en la matriz**. `02 §1.3` **no tiene matriz de casos**; la matriz existe en `docs/edge/E5_UHD_DOCTRINE.md §4.8` (5 filas, `:270-276`) y **no incluye 4K L183** (solo 4K L153); `ERRATA_AU.md:14` afirma que se «añadió a la matriz de 02 §1.3» (falso) y `:29` reconoce que la fila de `E5 §4.8` está pendiente ⇒ el caso no está en ninguna matriz auditable | Añadir a `02 §1.3` la tabla de 6 casos (1080p→4K · 4K L153→4K · **4K L183→8K (producto, marcado)** · 8K L153→4K · 8K L183→8K · ascendente→4K×2), corregir la errata y añadir la fila a `E5 §4.8` por tarea puente |
| **AU-09** | MEDIUM | `02 §4.2` paso 1: «**Primero** el fix E5-F3 (`X-APE-Internal` + `set_real_ip_from 127.0.0.1; real_ip_header X-Forwarded-For;`)» **contradice** `PLAN` C-1 (`:15`: la cita de E5-F3 como bypass era falsa y «no se repite») y F0-8 paso 5 (`PLAN:87`: `real_ip` **solo** si algún día hay acceso remoto). La errata no declara este texto | Reemplazar el paso 1 por el fix real (marcador/X-APE-Internal) sin re-citar E5-F3; si se quiere `real_ip` (127.0.0.1-only es seguro), justificarlo como hardening propio, no como «fix» de un hallazgo falso |
| **AU-10** | LOW | `PLAN:77` dice «los **7 hits** del repo»; medido: **13 ocurrencias en 4 archivos** (2 emisores, 1 vendor, 1 test). La conclusión (no está en parsers) no cambia | Corregir el número o decir «4 archivos» |

## 3. Lo que sigue sin poder verificarse aquí (declarado, no PASS)

- **Guard extendido (UHD-10)**: `uhd_doctrine_guard.mjs` **no se editó** (re-ejecutado: `exit 1`, `SELFTEST: PASS (8/8)`); G3b/C7 son **especificación** y la propia errata lo declara (`ERRATA §2`). El criterio «guard blocker/info» queda **especificado**, no **aplicado**: lo cierra B-02. No lo cuento como PASS ejecutado.
- `E5 §4.8` (matriz del dueño de E5) y `ape_luatest.lua:155-156` (G5) fuera de `docs/rea/`: **NOT_RUN** por contrato.
- Medición de devices (05 §1) y `dumpsys`: **NOT_RUN** (sin dispositivo).
- Coste CDN/NVENC: **NOT_RUN** declarado (04 §7, §2.4).

## 4. Veredicto global

**FAIL** — no se declara PASS con FAIL abierto. La corrección de `t26` es real y sustantiva: **AU-02, AU-03, AU-04, AU-05, AU-06, AU-07 y AU-08 quedan cerrados** con evidencia, la doctrina LOCKED se conserva y la excepción 8K está documentada, sin coste nuevo ni ficción. Fallan dos cosas concretas y pequeñas: **el caso de la excepción no está en ninguna matriz** (AU-01b, criterio explícito del capitán) y **`02 §4.2` sigue citando el «fix E5-F3» con `real_ip`** que C-1 declaró falso (AU-09). Con esas dos correcciones (más el número de AU-10) el plan pasa a PASS sin tocar `declare_auto`, sin coste y sin cambios de producción.
