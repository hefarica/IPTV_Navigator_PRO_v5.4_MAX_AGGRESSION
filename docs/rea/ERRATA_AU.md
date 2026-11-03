# ERRATA AU v2 — cierre de AU-01…AU-10 (auditorías `t25` y `t27`)

**Tarea:** `t28` · **Ciclo REA · corrección final** · **Autor:** `s5-qoe-qos` · **Fecha:** 2026-10-27 · **Snapshot:** `git HEAD a8ff0e9`
**v2 corrige** (hallazgos de `t27`): **AU-01b** = la matriz de casos **no existía** (la v1 de esta errata lo afirmaba en falso), **AU-09** = las re-citas de «E5-F3» en `02`, **AU-10** = la cifra de `STABLE-VARIANT-ID`. La ratificación de AU-01 de `t26` (excepción de producto, sin umbral 7680) **se mantiene**.
**Hashes v2 citados (previos a esta corrección):** `PLAN_REA.md` `79b32cb2…` · `02_…` `a2577d2e…` · `ERRATA_AU.md` `01b8d625…`.

---

## 1. Hallazgo → corrección → dónde

| ID | Corrección aplicada (v2) | Dónde |
|---|---|---|
| **AU-01 / AU-01b** (t25/t27, HIGH) | `can_declare_8k = (uhd8k=1) AND (nivel ≥L183 en todas las variantes top)`; fuente **≥3840 conservada** como **excepción de producto**; si 3840≤fuente<7680 y se declara 8K ⇒ **marcador obligatorio** `#EXT-X-APE-UPSCALE:…;src=<max_resolution>;declared=7680;can8k=1` y **nunca `-REAL`**. **La matriz de 6 casos ahora EXISTE** (§1b) y `02 §1.3` la referencia: la v1 decía que estaba en `02 §1.3` y **era falso** (allí solo había prosa). `V-3` con la excepción explícita | §1b · `PLAN §2` (AU-01, F0-2), `§5 V-3`, `§6 G3b/G6` · `02 §1.3-§1.5` (C7) |
| **AU-02** (t25) | Recuento **fila a fila**: §1 = **32 filas → 13 REAL · 8 POSIBLE · 4 IMPOSIBLE · 7 FALSO**; la cifra «9/5» del cierre de t24 queda desmentida | `PLAN §1` (encabezado) |
| **AU-03** (t25) | F0-8: **12 llamadores HTTP + 4 handlers = 16 medidos** + orden de gates con **fail-closed** (403 en mutación si `api_token` vacío, incluso loopback); sin migración no se publica. La auditoría cita 15 → diferencia de criterio declarada | `PLAN §2 F0-8` |
| **AU-04** (t25) | Clave de microcaché `host \| path \| args \| cred=<sha256_16>`: credenciales **nunca en claro** (hash de segregación) ⇒ no se cruza manifiesto entre clientes; bypass si no se aísla; nunca no-200; TTL ≤3 s | `PLAN §2 F0-11` |
| **AU-05** (t25) | `STABLE-VARIANT-ID` **0** en `parsers/**` ⇒ **NO_VERIFICADO**; F0-6 con **flag OFF por defecto** y activación solo tras probar en 2 players | `PLAN §2 F0-6`, `§7 B-06` |
| **AU-06** (t25) | F0-10 con **gate de contenido de lista** (0 canales sin probe con `CODECS=hvc1*` + diff contra la última lista + `node -c` ×3) | `PLAN §2 F0-10`, `§7 B-04` |
| **AU-07** (t25) | Build FFmpeg e iGPU `21,9 fps` ⇒ **`[MEDIDO-AUTOR] NO_VERIFICADO`**: no valen como gate | `PLAN` cabecera, `§1`, `§3` |
| **AU-08** (t25) | G1 con ruta real `_vps_stage/edge/baseline/` (phase0_backup 5.086 B · phase0_verify 2.174 B · restore_phase0 3.402 B); G8 exige **baseline sha256 de las listas antes de tocar nada** (`runs/<ts>/lists_baseline.txt`), hoy inexistente | `PLAN §6 G1, G2, G8` |
| **AU-09** (t27, MED) | **Re-citas de «E5-F3» neutralizadas** en `02`: L117 (tabla «Seguridad primero»), **L144 (párrafo «Hoy», que el hallazgo no listaba: la encontré yo)**, L148-150 (bloque «orden de implementación»), L202 (tabla de riesgos) y L210 (paso 0). Reescritas como: **no hay prerrequisito de `real_ip`**, la API se queda en **8088 loopback**, `/_ape/*` no se proxea desde 443, token **solo para mutación** con **403 fail-closed**. `set_real_ip_from 127.0.0.1` queda como **hardening propio opcional**, explícitamente **no** «E5-F3» | `02 §3` (L117), `§4.2` (L144-150), `§4.5` (L202), `§5` (L210) |
| **AU-10** (t27, LOW) | Cifra sustituida **con alcance y comando**: `frontend/js/ape-v9/parsers/**` = **0** ocurrencias · **código ejecutable = 11 ocurrencias / 3 archivos** (`m3u8-typed-arrays-ultimate.js` ×6 · `ape-fallback-resolver.js` ×3 · `_vps_stage/tests/quality_denomination_assert.js` ×2; alcance = frontend sin vendor/node_modules + `vps` + `_vps_stage`, `.js/.html/.php/.lua`). El «7 hits» era falso; la conclusión (**ningún parser lo consume**) no cambia | `PLAN §2 F0-6` |

---

## 1b. Matriz de decisión UHD (6 casos) — referenciada desde `02 §1.3`

| Caso (fuente real → nivel HEVC) | RESOLUTION declarada | ¿Marcador `#EXT-X-APE-UPSCALE`? | ¿`-REAL`? |
|---|---|---|---|
| 1080p → **L153** | `3840x2160` (**producto**, excepción) | **sí** — `src=1920x1080;declared=3840;can8k=0` | **nunca** (`-PREFERRED`) |
| 4K → **L153** | `3840x2160` | sí, si hubo upscale desde 1080p | **nunca** |
| **4K → L183** | **`7680x4320` (producto, MARCADO)** ← *el caso que faltaba* | **sí, obligatorio** — `src=3840x2160;declared=7680;can8k=1` | **nunca** |
| 8K → **L153** | `3840x2160` (degradado: nivel insuficiente para 8K) | no (no hay upscale) | puede ser `-REAL` del 4K real |
| 8K → **L183** | `7680x4320` (fuente real ≥7680) | **no** (no es upscale) | **sí** admisible |
| master **ascendente** (varias variantes) | `3840x2160` **una sola vez**, decidido por `max_resolution()` | sí | **nunca** |

**Regla que la matriz hace explícita:** el marcador es la frontera entre «producto declarado» y «mentira». Un 8K sobre fuente 4K **sin** marcador es **blocker** (UHD-10, especificado en `02 §1.4 C7`); **con** marcador y `L183` es **info**.

---

## 2. Pendiente por alcance — `PENDIENTE_BRIDGE`, no fingido

| Ítem | Estado | Motivo |
|---|---|---|
| Fila «4K L183 → 8K (producto, marcado)» en `docs/edge/E5_UHD_DOCTRINE.md §4.8` | **PENDIENTE_BRIDGE** | La tarea ordena escribir **solo en `docs/rea/`** y no tocar `docs/edge/`. La fila está redactada en §1b; aplicarla es de 1 línea |
| Extensión de `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs` (UHD-10 + selftest «4K L183 con marcador») | **PENDIENTE_BRIDGE** | La tarea **prohíbe tocar código**. Comportamiento exacto especificado en `PLAN §6 G3b/G4` y `02 §1.4 C7` |

---

## 3. Integridad documental (medida en esta sesión)

| Documento | Antes (v2) | Ahora (v3) | Estado |
|---|---|---|---|
| `PLAN_REA.md` | 200 L · `79b32cb2a0d47731…` | **200 L** · `9936c9370caf11ff…` | v3 (solo AU-10) |
| `02_EDGE_DECLARE_AUTO_API.md` | 220 L · `a2577d2e8d146cb5…` | **220 L** · `d8358b6bd1722f72…` | v3 (AU-01b + AU-09) |
| `ERRATA_AU.md` | 46 L · `01b8d625599b0ed5…` | **59 L** · *hash no auto-referenciable: se declara en el reporte al capitán* | v2 (este archivo) |
| `01` · `03` · `04` · `05` · `AUDITORIA_PLAN_REA.md` | `e6872b48…` · `f8989348…` · `157f3222…` · `bdde76fe…` · `70fa21cf…` | **idénticos** | **intactos** |

**Límites respetados:** PLAN **200 ≤200** · `02` **220 ≤220** · ERRATA **≤60**. Cero cambios en código, listas, `_vps_stage`, `docs/edge/` o VPS. **Cero cifras sin alcance:** las cifras de AU-10 y AU-03 llevan su criterio y su comando declarados.
