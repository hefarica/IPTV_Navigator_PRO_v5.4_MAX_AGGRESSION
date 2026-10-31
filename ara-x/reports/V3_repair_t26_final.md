# V3 · Cierre final de F-02 y T26-B2 (V3-R2d)

**Tarea:** `t31` (V3-R2d, re-emisión F-02-only de `t26`) · **Autor:** `hls-architect` · **Fecha:** 2026-10-30
**Cadena:** `t26` (F-02 redactado) → `t28` (repair `vps-edge`) → `t29` (failed por T29-B1, fuera de scope) → **`t30`** (arregla el assert legacy) → **`t31` (este cierre documental)**
**Re-audita:** `t27`

**Veredicto:**

| Bloque | Estado | Evidencia |
|---|---|---|
| **F-02** — credenciales en la evidencia R1 | **CERRADO** (redacción de `t26`, re-verificada aquí) | §2 · `scan_secrets` 0/105 · `r1_selfcheck` 102/102 · 0 URLs de credencial |
| **T26-B2** — F-03/04/06/07/08/10/11 en `vps-edge` | **CUBIERTO por `t28`**, gates re-ejecutados aquí | §3 · 117/117 · 11/11 · 12/12 · 43/43 |
| **F-05** — clave global Lua (sin store por dispositivo) | **NO-GO** documentado por `t28` — **no arreglado** | §3.2 |
| **T26-B1 / F-01** — par cuenta/clave en 10.631 URLs + CORS `*` + cache pública | **NO-GO de owner/producción** — **no arreglado** | §4.1 |
| **F-09** — R3-R4 deny, R3-R5 `/cdn/` sin allowlist, R3-R6/R7 | **NO-GO de owner/VPS** — **no arreglado** | §4.2 |
| **T29-B1** — assert legacy de `security.test.js` | **RESUELTO por `t30`** (owner correcto) | §5 · suite 191/189/0/2 · security 13/13 |

**No hay deploy, ni commit, ni escrituras en el VPS. No se reproduce ningún valor sensible.**

---

## 1 · Qué cierra esta tarea y qué no

Cierra **documentalmente** dos bloques que ya estaban reparados en el repo:

1. **F-02** — la evidencia forense de R1 (`reports/r1_evidence/**`) quedó redactada en `t26` y **no se ha vuelto a tocar**.
2. **T26-B2** — los hallazgos de `vps-edge` (F-03/04/06/07/08/10/11) fueron reparados por **`t28`** en `ara-x/vps/**`
   (staged, sin deploy). Esta tarea **re-ejecuta sus gates** en lugar de fiarse del resumen.

**No cierra** (y lo declara explícitamente):

- **F-01 / T26-B1 (CRITICAL)**: exige rotación del par en el proveedor + cambios de producción. **NO-GO**.
- **F-09**: R3-R4/R3-R5 (y R3-R6/R3-R7) viven en el VPS. **NO-GO**.
- **F-05**: la clave única por dispositivo **sigue sin resolverse**; `t28` la documenta NO-GO.

---

## 2 · F-02 · evidencia R1 sin credenciales (cerrado)

| Fichero | Bytes | sha256 | URLs de credencial |
|---|---|---|---|
| `reports/r1_evidence/cdn_full.json` | 107.972 | `170DF79E…1132C80` | **0** |
| `reports/r1_evidence/local_full.json` | 107.868 | `843FBADD…7D548E8` | **0** |

- Redacción aplicada en `t26` (regla: sólo URLs con `/live/` o `/a/<n>/`; se conserva esquema + host + **longitud de cada
  segmento** como `<Nc>`, se elimina la query). Formas resultantes:
  `https://iptv-ape.duckdns.org/cdn/<17c>/<4c>/<6c>/<6c>/<12c>` y `#EXTATTRFROMURL:…/a/2/<11c>/<10c>/P1/<166c>`.
- Métricas forenses intactas: 572.170.477 / 568.241.457 B; 10.169.562 / 10.139.240 líneas; 10.631 canales; 772 nombres de
  tag; `last_lines` = 8 entradas por fichero.

**Verificación ejecutada:**

| Comprobación | Resultado |
|---|---|
| `node ara-x/scripts/security/scan_secrets.js` | **exit 0 · files: 105 · findings: 0 · skipped: 0** |
| `node ara-x/scripts/forensics/r1_selfcheck.js` | **checks=102 pass=102 fail=0 · ALL_OK** |
| Escaneo propio de credenciales en los 9 JSON de `r1_evidence` (`/live/<seg>/<seg>/`, `/a/<n>/<seg>/<seg>/`, `user:pass@`) | **0 hits** |

---

## 3 · T26-B2 · cubierto por t28 (gates re-ejecutados)

`t28` reparó `ara-x/vps/**` (staged, sin deploy). **Gates verificados ahora**, no citados de memoria:

| Gate | Comando | Resultado |
|---|---|---|
| Checker del módulo Lua | `node ara-x/scripts/lua/check_lua_module.js` | **ALL CHECKS PASS (117/117)** · exit 0 |
| Tests Lua | `node --test ara-x/tests/lua_module.test.js` | **11 tests · 11 pass · 0 fail** · exit 0 |
| Tests sync | `node --test ara-x/tests/sync.test.js` | **12 tests · 12 pass · 0 fail** · exit 0 |
| Checker del contrato sync | `node ara-x/scripts/sync/check_sync_contract.js` | **ALL CHECKS PASS (43/43)** · exit 0 |

Correspondencia con los hallazgos: **F-03** (helper auto-serve eliminado; HMAC embebido), **F-04** (respuesta Lua sin
`soc_canonical`/`prov`/`conf`; `validatePolicy` real acepta el fixture), **F-06** (zona `ara_sync_lua` definida),
**F-07** (`Retry-After`), **F-08** (`device_ids` obligatorio + binding + store 0600), **F-10** (parser estricto + scanner
de claves + `soc_raw`), **F-11** (sin `lab_content` inyectado).

### 3.1 F-05 · NO-GO (no arreglado)

La autenticación **por dispositivo** sigue sin resolverse: se mantiene una **clave global** (la misma de `/a/`) sin
`key_id`/store por device. `t28` lo deja documentado como NO-GO. **Esta tarea no declara F-05 arreglado.**

### 3.2 NOT_RUN (declarado, no PASS)

`luac -p` y `nginx -t` no se ejecutaron (no hay Lua/ventana en este entorno). **No se declaran verdes**; entrarán en la
ventana de despliegue (NO-GO hasta entonces).

---

## 4 · T26-B1 / F-01 y F-09 · NO-GO de owner/producción (no arreglado)

### 4.1 F-01 (CRITICAL) — lista pública con par cuenta/clave + CORS + cache

El par cuenta/clave viaja **constante en el path** de las 10.631 URLs; la lista se sirve con `Access-Control-Allow-Origin: *`
y `Cache-Control: public, max-age=300`. **No es un fix de repo**: requiere owner + proveedor + producción.

Acciones exigidas (en orden):

1. **Rotar el par cuenta/clave en el proveedor** y regenerar la lista.
2. **Quitar** `Access-Control-Allow-Origin/Methods/Headers/Expose-Headers` de `/lists/`.
3. **`Cache-Control: private, max-age=300`** (una sola cabecera) + **`X-Robots-Tag: noindex, nofollow`**.
4. Valorar URLs firmadas / allowlist / entrega autenticada por el VPS.
5. **NO-GO de producción** hasta rotación + verificación de 0 credenciales en artefactos públicos.

**La redacción de F-02 no mitiga F-01**: el par sigue expuesto en la lista servida. Aquí **no se declara arreglado**.

### 4.2 F-09 (MEDIUM, VPS) — R3-R4/R3-R5/R3-R6/R3-R7

| ID | Estado | Acción (ventana VPS) |
|---|---|---|
| R3-R4 | **abierto** | `deny all` de `/iptv-ape/` comentado por `\n` literal (`sites-enabled/default:198`); corregir + `nginx -t` |
| R3-R5 | **abierto** | `/cdn/` acepta cualquier host público; allowlist o deny fuera de hosts autorizados |
| R3-R6 | **abierto** | watchdog puede `reload`/`restart` nginx; asumir interferencia y verificar `/_ape/health` |
| R3-R7 | **abierto** | APKs servibles en `/ara/candidate` y `/ara/fluid`; retirar/limitar |

**NO-GO**; ninguno se tocó (write-scope VPS prohibido) y ninguno se declara arreglado.

---

## 5 · T29-B1 · resuelto por t30 (suite verde)

`t29` falló porque `tests/security.test.js:358` asertaba el estado **pre-t28** de F-04 (`assert.match(lua, /soc_canonical/)`).
**`t30`** (owner: `security-auditor`) lo corrigió en su propio artefacto:

```js
// antes (pre-t28): assert.match(lua, /soc_canonical/);
assert.equal(/soc_canonical/.test(lua), false, 'V3-F-04 reparado en t28: la respuesta Lua no añade extras');
```

Estado verificado ahora:

- `node --test ara-x/tests/security.test.js` → **13 tests · 13 pass · 0 fail · exit 0**.
- `node --test ara-x/tests/*.test.js` → **191 tests · 189 pass · 0 fail · 2 skipped · exit 0**.
- El test nº 191 lo añadió `t28` (10 → 11 tests Lua); por eso el denominador es 191 y no 190.

Informe de `t30`: `ara-x/reports/V3_repair_t29.md`.

---

## 6 · Comandos ejecutados (esta tarea)

```powershell
node ara-x/scripts/security/scan_secrets.js        # exit 0 · files:105 · findings:0
node ara-x/scripts/forensics/r1_selfcheck.js       # 102/102 · ALL_OK · exit 0
node --test ara-x/tests/security.test.js           # 13/13 · exit 0
node --test ara-x/tests/*.test.js                  # 191 · 189 pass · 0 fail · 2 skipped · exit 0
node ara-x/scripts/lua/check_lua_module.js         # ALL CHECKS PASS (117/117) · exit 0
node --test ara-x/tests/lua_module.test.js         # 11/11 · exit 0
node --test ara-x/tests/sync.test.js               # 12/12 · exit 0
node ara-x/scripts/sync/check_sync_contract.js     # ALL CHECKS PASS (43/43) · exit 0
```

**Sin deploy, sin commit, sin escrituras en el VPS.** `php -l` / `luac -p` / `nginx -t` = **NOT_RUN** (declarado).

---

## 7 · Lo que sigue abierto (para t27 y owner)

| Item | Owner | Estado |
|---|---|---|
| **F-01**: rotar par, quitar CORS, cache private/noindex, URLs firmadas | owner + proveedor + producción | **NO-GO** |
| **F-09 / R3-R4, R3-R5, R3-R6, R3-R7** | owner + VPS (ventana) | **NO-GO** |
| **F-05**: store por dispositivo (clave global hoy) | vps-edge | **NO-GO** documentado |
| `luac -p` / `nginx -t` | vps-edge (ventana) | **NOT_RUN** |
| Producción | owner | **NO-GO** hasta cerrar lo anterior |

`t27` re-audita con este estado. **Ningún fix de producción se declara hecho en este informe.**

---

## 8 · Enlaces de la cadena

- `ara-x/reports/V3_security.md` — veredicto original (FAIL / NO-GO) y findings F-01…F-12.
- `ara-x/reports/V3_repair_r2.md` — redacción de F-02 (t26) y mapa (a)(b)(c).
- `ara-x/reports/V3_repair_t26.md` — intento de re-scope (t29) y bloqueo T29-B1.
- `ara-x/reports/V3_repair_t29.md` — corrección del assert legacy (t30).
- `t28` (V3-R2) — repair de `vps-edge` F-03/04/06/07/08/10/11; F-05 NO-GO.
- `t27` — re-auditoría de seguridad.
