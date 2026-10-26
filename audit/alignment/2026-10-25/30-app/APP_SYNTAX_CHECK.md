# APP_SYNTAX_CHECK — Verificación de sintaxis con exit codes reales

**Task:** t6 · T5 · Auditoría de la APP
**Attempt:** `bf962cfc-3985-412c-b4a0-8fca541a817e`
**Host:** Windows · `node v24.12.0` (verificado: `node --version` → `v24.12.0`, exit `0`)
**Método:** `node -c <archivo>` con **stdout y stderr capturados por separado** (`Start-Process -RedirectStandardOutput/-RedirectStandardError`), para poder afirmar "sin stderr" en vez de suponerlo.

---

## 1. JS — `node -c` (todos los archivos del foco)

`node -c` es alias de `node --check`: parsea el archivo sin ejecutarlo. Exit 0 = sintaxis válida.

| # | Archivo | Comando exacto | Exit | stdout | stderr |
|---:|---|---|---:|---|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | **0** | 0 bytes | *(vacío)* |
| 2 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | **0** | 0 bytes | *(vacío)* |
| 3 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-hevc-cascade.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-hevc-cascade.js` | **0** | 0 bytes | *(vacío)* |
| 4 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js` | **0** | 0 bytes | *(vacío)* |
| 5 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js` | **0** | 0 bytes | *(vacío)* |
| 6 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/gateway-manager.js` | `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/gateway-manager.js` | **0** | 0 bytes | *(vacío)* |

**Resultado: 6/6 exit 0, cero stderr.** Salida cruda de la ejecución (transcrita del run real):

```
### node --version
v24.12.0
exit=0

FILE=IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
  CMD: node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
  EXIT: 0
  STDOUT_BYTES: 0
  STDERR: <empty>
FILE=…/ape-profiles-config.js   EXIT: 0  STDOUT_BYTES: 0  STDERR: <empty>
FILE=…/ape-hevc-cascade.js      EXIT: 0  STDOUT_BYTES: 0  STDERR: <empty>
FILE=…/ape-fallback-resolver.js EXIT: 0  STDOUT_BYTES: 0  STDERR: <empty>
FILE=…/ape-quality-prober.js    EXIT: 0  STDOUT_BYTES: 0  STDERR: <empty>
FILE=…/gateway-manager.js       EXIT: 0  STDOUT_BYTES: 0  STDERR: <empty>
```

### 1.1 Contraste con el estado de integridad

Los 6 archivos tienen el **mismo sha256 al inicio y al cierre** de la auditoría (ver `APP_INVENTORY.md` §0).
Por tanto estos exit codes describen **exactamente** los bytes auditados, no una versión anterior o posterior.
`m3u8-typed-arrays-ultimate.js` (modificado hoy 21:52 por t44) se verificó **después** de esa escritura.

### 1.2 Qué NO prueba `node -c`

`node -c` valida **gramática**, no semántica ni contrato. Un archivo puede dar exit 0 y aun así:
- emitir un `CODECS=` con un nivel HEVC imposible (`L153` sobre 8K) → **verificado que ocurre** en `resolve_quality_unified.php` (PHP, no JS);
- dejar una referencia `window.X` indefinida;
- declarar dos veces la misma constante.
Por eso `APP_HARDCODE_FINDINGS.md` y `APP_EMISSION_CONTRACT.md` son el análisis de fondo; este documento es
solo la puerta sintáctica.

### 1.3 Archivos JS del foco que NO requieren `node -c`

`frontend/index-v4.html` es HTML (no JS). Se auditó su orden de carga en `APP_INVENTORY.md` §1.1 — se puede
validar su estructura con un parser HTML, pero **no con `node -c`**, y no se declara aquí ningún exit code para él.

---

## 2. PHP — `php -l` **BLOQUEADO por entorno** (limitación honesta, no se simula)

### 2.1 Lo que se intentó, con resultado medido

| Intento | Comando | Resultado |
|---|---|---|
| PHP en `PATH` (Windows) | `Get-Command php` | **no encontrado** (`False`) |
| PHP dentro de WSL | `wsl -e sh -lc "command -v php"` | **`NONE`** (WSL existe, PHP no está instalado) |
| PHP portable en el repo / ubicaciones típicas | `glob **/php*`; `C:\php`, `C:\xampp\php`, `C:\laragon\bin\php`, `C:\wamp64\bin\php`, `C:\Program Files\php` | solo `IPTV_v5.4_MAX_AGGRESSION/php_ua_lines.txt` (un `.txt`, no un binario). **Ningún intérprete PHP disponible.** |

**Conclusión: `php -l` NO se pudo ejecutar. No se reporta exit code de PHP porque no existe.**

### 2.2 Sustituto intentado y por qué se DESCARTA

Se intentó un balance de delimitadores (`{}`, `()`, `[]`) con y sin eliminación previa de comentarios y strings.
Resultados:

| Archivo | Sin stripping (bruto) | Con stripping por regex |
|---|---|---|
| `resolve_quality_unified.php` | `{`=908 / `}`=908 (Δ0) · `(`=2985 / `)`=2986 (Δ−1) | `{`=327/333 (Δ−6) · `(`=1010/986 (Δ+24) · `[`=780/775 (Δ+5) |
| `rq_streaming_health_engine.php` | `{`=20/20 · `(`=117/117 · Δ0 | `{`=13/13 · `(`=105/105 · Δ0 |
| `ape_hls_generators.php` | `{`=141/141 · `(`=205/205 · Δ0 | `{`=15/15 · `(`=44/42 (Δ+2) · `[`=24/25 |

**Por qué se descarta como veredicto:** el bruto cuenta paréntesis dentro de strings y comentarios (inocuo); el
"stripping" por regex **rompe** el archivo porque PHP contiene heredocs, `#` como comentario, `#[Attribute]`,
`${...}` interpolado y URLs con `//` dentro de strings — de ahí los Δ absurdos y los 10 falsos "brace negativo".
Un `Δ` obtenido así **no es evidencia de error de sintaxis ni de corrección**. Reportarlo como veredicto sería
fabricar evidencia, exactamente lo que la doctrina prohíbe.

### 2.3 Estado declarado

```
PHP SYNTAX: UNVERIFIED (no lint available on this host)
```

**No hay indicio de error de sintaxis** (el archivo bruto está balanceado en `{}` y `()` salvo Δ−1 atribuible a
un `)` dentro de literal, y el resolver está en producción sirviendo), pero **eso no es una verificación**.

### 2.4 Acción requerida del capitán / operador (fuera de mi alcance, 1 comando)

Ejecutar en cualquier host con PHP ≥ 8.0 (el VPS `178.156.147.234` lo tiene, PHP 8.3):

```bash
php -l IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
php -l IPTV_v5.4_MAX_AGGRESSION/backend/rq_streaming_health_engine.php
php -l IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
php -l IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/dual_manifest_generator.php
php -l IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/universal_codec_protocol_engine.php
php -l IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/telchemy_tvqm_engine.php
```

Criterio de aceptación: **6/6 `No syntax errors detected`**. Los sha256 a comparar son los de
`APP_INVENTORY.md` §0 para garantizar que se lintea el mismo byte que se auditó.

> **Nota de alcance:** mi auditoría PHP es **estática y de contenido** (bindings, emisión, invariantes). La
> puerta sintáctica de PHP queda **pendiente y declarada**, no aprobada por omisión.

---

## 3. JSON — validación del SSOT consumido

`frontend/lab_master_22.6.0.json` (280 065 B · sha256 `099A1707…FD4`) se cargó con `ConvertFrom-Json` sin error
→ **JSON bien formado**. Claves raíz leídas (18):

```
playlist_format, exported_at, profiles_calibrated, nivel1_directives, nivel3_per_layer, servers,
evasion_pool, config_global, placeholders_map, scoring_metadata, omega_gap_plan, lab_version,
lab_schema_variant, bulletproof, meta_per_profile, prisma_lab_sync_v20, version, dnr_calibration
```

`profiles_calibrated` contiene exactamente `P0, P1, P2, P3, P4, P5` — sin huecos ni perfiles extra.

**Nota:** el `phar`/`json.tool` no aplica (no es PHP); se usó el parser JSON nativo. Sin error ⇒ válido.

---

## 4. Archivos de `cmaf_engine` — estado de verificación

36 archivos (`*.php`, `*.py`, `*.js`, tests). **Ninguno fue linteado** (misma limitación PHP; los `.py`
requerirían `python -m py_compile` y los `.js` `node -c`, que sí están disponibles pero **no son el foco de
sintaxis de esta tarea**). Se declara explícitamente: `cmaf_engine` entra en esta auditoría **solo por análisis
de contenido** (literales calibrados), no por sintaxis.

---

## 5. Resumen de la puerta sintáctica

| Capa | Archivos | Verificado | Veredicto |
|---|---:|---|---|
| JS (`node -c`) | 6 | 6/6 | ✅ **PASS** — exit 0, stderr vacío, bytes estables |
| PHP (`php -l`) | 3 del foco (+3 cmaf) | 0/6 | ⛔ **UNVERIFIED** — sin intérprete PHP en el host; requiere 1 comando externo (§2.4) |
| JSON | 1 | 1/1 | ✅ **PASS** — parsea sin error |
| HTML | 1 | orden de carga leído | ⚠️ sin parser HTML; se validó manualmente el orden (§1.1 de `APP_INVENTORY.md`) |
