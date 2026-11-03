# Certificación del capitán — PLAN REA v3 (2026-10-27)

**Ámbito certificado:** `docs/rea/**` (investigación y plan). **No** certifica código ni despliegue: Fase 0 sigue sin aplicarse y Fase 1 no autorizada.
**Snapshot:** git `a8ff0e9` (el goal citaba `e38a89b`; los 5 docs lo declaran).

## 1. Decisión de producto que rige (AU-01)

El propietario ordenó: **«NUNCA QUITAR `declare_auto` reescribiendo RESOLUTION a 4K/8K»**. La auditoría `t25` propuso exigir fuente ≥7680; **no se aplica** porque cambiaría esa decisión LOCKED.

> **Ratificación expresa del propietario (2026-10-28 04:15 America/Bogota):** **APRUEBA A** y **ANULA B** («no la aplica esa B, pues cambia mi doctrina»). Registro: [`DECISION_A_LOCKED.md`](DECISION_A_LOCKED.md). A partir de aquí, cualquier propuesta que reintroduzca B se rechaza citando esa decisión.

Regla certificada:
- `declare_auto` **vivo** (ruta por defecto) y sigue reescribiendo `RESOLUTION`.
- `can_declare_8k = (uhd8k=1) AND (nivel HEVC ≥ L183 en todas las variantes top)`.
- Fuente **≥3840 se conserva** como **excepción de producto**.
- Si una fuente <7680 declara 8K, la variante **debe** llevar `#EXT-X-APE-UPSCALE:…;src=<real>;declared=7680;can8k=1` y **nunca** `-REAL`.
- `CODECS=` intocable (GOLDEN RULE); 8K con nivel <L183 = blocker (UHD-09).

Matriz de 6 casos: `ERRATA_AU.md §1b` (incluye «**4K L183 → 8K producto MARCADO**», el caso que faltaba).

## 2. Verificación del capitán (comandos ejecutados)

| Artefacto | Líneas | sha256 (12) | Estado |
|---|---|---|---|
| `PLAN_REA.md` v3 | 200 | `9936c9370caf` | ✅ |
| `02_EDGE_DECLARE_AUTO_API.md` v3 | 220 | `d8358b6bd172` | ✅ |
| `ERRATA_AU.md` v2 | 59 | `fb23e2abd3ad` | ✅ |
| `01`, `03`, `04`, `05` | — | `e6872b48` / `f8989348` / `157f3222` / `bdde76fe` | ✅ intactos |

- **AU-01b CERRADO (ámbito docs/rea):** matriz de 6 filas existe; ERRATA:14 corregida (declara que la v1 mentía). Fila de `docs/edge/E5_UHD_DOCTRINE.md §4.8` = `PENDIENTE_BRIDGE`.
- **AU-09 CERRADO:** `02` no depende de `real_ip` ni de «fix E5-F3» (5 re-citas neutralizadas: L117/L144/L148/L202/L210). API queda en **8088 loopback**, `/_ape/*` no proxeado desde 443, token solo mutación, **403 fail-closed** si `api_token` vacío.
- **AU-10 CERRADO:** «7 hits» eliminado. Cifra medida y con alcance: `parsers/**` = **0**; código ejecutable = **11 ocurrencias / 3 archivos**.
- **AU-02…AU-08:** cerrados en `t27` (7/7 PASS verificado por el auditor).

## 3. Coste y riesgos

- Fase 0 (11 cambios F0-1…F0-11): **€0**. No toca listas ni vídeo; todo metadata/edge/observabilidad.
- Único importe: **B-11** nodo GPU ≈ **€423 el primer mes** (GEX45 €214/mes + €209 setup, referencia de lista pública, no cotización). **Gateado a aprobación explícita del propietario.**
- `declare_auto` conservado; excepción documentada y marcada, no oculta.

## 4. Pendiente que excede el ámbito de escritura del team (2)

1. Fila «4K L183 → 8K (producto, marcado)» en `docs/edge/E5_UHD_DOCTRINE.md §4.8` (1 línea; scope del otro workstream).
2. Extensión de `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs`: **UHD-10** (8K sobre fuente <7680 **sin** marcador = blocker; **con** marcador y L183 = info) + selftest del caso 4K-L183-con-marcador (≈10 líneas; código).
Comportamiento exacto especificado en `PLAN §6 G3b/G4` y `02 §1.4 C7`. No se ejecutan sin autorización del propietario (tarea puente).

## 5. Veredicto del capitán

**PLAN REA v3: CERTIFICADO (PASS) en su ámbito documental**, con los **2 PENDIENTE_BRIDGE declarados** y la decisión de producto **A ratificada por el propietario** y **B anulada** ([`DECISION_A_LOCKED.md`](DECISION_A_LOCKED.md)). El veredicto FAIL de `t27` queda cerrado en sus 3 hallazgos por verificación directa del capitán (no se reescribió la auditoría: sigue en disco como evidencia).
**No se ha tocado** código, `_vps_stage`, `docs/edge`, listas ni VPS en todo el ciclo REA.

**Firmado:** capitán del team `equipo-enterprise-10-adn` · 2026-10-27 · **ratificación del propietario: 2026-10-28 04:15 (America/Bogota)**.
