# REGLA DE ORIGEN — obligatoria para el consolidador y el auditor independiente

**Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`) · **Congelado:** ver `SNAPSHOT.json` (`captured_at`).

## 1. Hay DOS sistemas de coordenadas y no son intercambiables

| Coordenada | Qué es | Inmutabilidad |
|---|---|---|
| **blob HEAD** | `git show HEAD:<path>` → `<basename>.HEAD.blob` | **inmutable** (sha del objeto git) |
| **WT `<sha8>`** | copia byte a byte del worktree en `captured_at` → `<basename>.WT.<sha8>.blob` | **mutable**: otra sesión estaba escribiendo durante la auditoría |

Generador en HEAD: `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` = blob **`c1277bdf…`**, **707 323 B**, **11 144 líneas** (LF). Es la única forma estable de citarlo.

## 2. Reglas (no negociables)

1. **Toda cita del generador, de `index-v4.html`, de `ape-fallback-resolver.js`, de `resolve_quality_unified.php`/`resolve.php` y de los 3 `.lua` de `_vps_stage/` DEBE declarar la coordenada**: `HEAD c1277bdf` o `WT <sha8>`.
2. **No se suman ni se comparan conteos entre blobs distintos.** Un total de líneas/hallazgos medido sobre WT no se mezcla con uno medido sobre HEAD.
3. **Un hallazgo medido sobre el WT vale SOLO para el `wt_sha256` declarado** en `SNAPSHOT.json`. Si el WT cambia, el hallazgo queda histórico.
4. **Conteo de líneas = `[System.IO.File]::ReadAllLines().Length`.** `Measure-Object -Line` descarta líneas vacías y dio 10 417 en vez de 11 144: sus cifras no son comparables.
5. **Los informes Council ajenos no se editan.** Si un hash no coincide se reporta en `REPORT_HASHES.json` (ya aplicado).

## 3. Deriva medida del WT del generador (misma sesión de auditoría)

| Hora | Bytes | Líneas | sha256 (8) | Fuente |
|---|---|---|---|---|
| ~04:12 | — | **21 581** | — | medición S3 (S1-F01 se midió aquí) |
| ~04:15 | — | 11 443 | — | medición del captain |
| 04:19:53 | 739 652 | 11 459 | `37ab2ca7` | medición del captain |
| 04:27:34 | 743 867 | 11 524 | `d29f62af` | **congelamiento #1 (t9)** |
| 04:29:02 | 743 883 | 11 524 | `da442864` | **congelamiento #2 (t9, el vigente)** |

⇒ El WT **se movió al menos 4 veces** durante la auditoría. Existen 2 blobs WT del generador: el `d29f62af` (04:27:34) y el `da442864` (04:29:02). Ambos se conservan: la diferencia entre ellos **es** la prueba de la mutación.

## 4. Consecuencia sobre S1-F01

`S1-F01` (+10 447 / −10) se midió ~04:12 sobre un WT de **21 581 líneas**, que ya no existe. **Es histórico y está SUPERADO**: no describe HEAD (`c1277bdf`, 11 144 L) ni el WT vigente (`da442864`, 11 524 L). Ninguna cifra de S1-F01 debe entrar en el consolidado como estado actual.

## 5. Hashes de los informes Council

Ninguno de los 8 `.md` contiene su propio SHA-256 completo (0 matches de `[0-9a-fA-F]{64}` en los 8). Lo declarado al captain se re-verifica en `REPORT_HASHES.json`: S6 y S8 declaran hash completo y **coinciden**; S5 y S7 declaran **prefijo de 8** y el prefijo **coincide**; S1/S2/S3_S4/S9 no declaran hash. El sufijo del hash de S5 **no es verificable desde ningún artefacto del repo** (no está escrito completo en el informe ni en el resumen): la afirmación «no coincide en el resto» queda **NO VERIFICADA**, no refutada.
