# V3-R2c · Follow-up t29: alinear `security.test.js` a t28 (F-04)

Fecha: 2026-10-30 · Autor: `security-auditor` · Tarea: **t30** (source: t29) · Attempt: `f099237e-e695-4c94-ac68-e66a8e96ae39`
Scope: `ara-x/tests/security.test.js`, `ara-x/reports/V3_repair_t29.md`. Repo-only: **sin VPS, sin deploy, sin commit**.

**Estado: PASS de t30.** El bloqueo T29-B1 (assert legacy) queda corregido; la suite global vuelve a
**191 tests · 189 pass · 0 fail · 2 skip · exit 0**. Esto **no** cambia el veredicto global de V3
(`FAIL / NO-GO` por F-01/F-05/F-09 de owner/producción); t30 solo elimina una aserción de test obsoleta.

---

## 1. Causa

`t28` reparó **V3-F-04**: `ara-x/vps/lua/ara_x_sync.lua` ya no añade `soc_canonical`, `prov` ni `conf`
top-level (0 ocurrencias). Pero `ara-x/tests/security.test.js:358` seguía asertando el estado **pre-t28**:

```js
const lua = read('vps/lua/ara_x_sync.lua');
assert.match(lua, /soc_canonical/);   // exigía que el defecto existiera
assert.match(V3, /V3-F-04/);
```

Resultado: `security.test.js` **12/13**, suite global `191 · 188 pass · 1 fail · 2 skip`, exit 1.
El resto del test era correcto: `client.validatePolicy({...example, soc_canonical:...})` **rechaza** los
extras; el fallo era de **estado esperado**, no del cliente ni de t28. `t29` no podía corregirlo
(`security.test.js` estaba fuera de su scope).

## 2. Cambio aplicado (mínimo, 2 líneas)

```diff
-  assert.match(lua, /soc_canonical/);
+  assert.equal(/soc_canonical/.test(lua), false, 'V3-F-04 reparado en t28: la respuesta Lua no añade extras');
   assert.match(V3, /V3-F-04/);
```

También se ajustó el título del test para describir el estado reparado:

```diff
-test('Lua response con extras top-level es rechazada por el cliente (V3-F-04)', () => {
+test('Lua response sin extras top-level; el cliente rechaza extras (V3-F-04)', () => {
```

La prueba semántica se conserva intacta: los tres extras (`soc_canonical`, `prov`, `conf`) siguen
rechazándose vía `client.validatePolicy` en el bucle anterior. No se debilitó ninguna otra aserción.

**Archivo:** `ara-x/tests/security.test.js` · `sha256 5d99623e4adf97ebeccd770c649dd2eaf755c14953a5a70cb3abd1f0ec400922` · 20.805 B · `node --check` exit 0.

## 3. Verificación (todo local, sin red/VPS)

| Gate | Comando | Resultado |
|---|---|---|
| Test de seguridad | `node --test ara-x/tests/security.test.js` | **13 tests · 13 pass · 0 fail** · exit 0 |
| Suite global | `node --test 'ara-x/tests/*.test.js'` | **191 tests · 189 pass · 0 fail · 2 skip** · exit 0 |
| Secretos | `node ara-x/scripts/security/scan_secrets.js` | **102 archivos · 0 findings** · OK |
| R1 selfcheck | `node ara-x/scripts/forensics/r1_selfcheck.js` | **102/102 · ALL_OK** |
| Lua checker | `node ara-x/scripts/lua/check_lua_module.js` | **117/117 · ALL CHECKS PASS** |
| Lua tests | `node --test ara-x/tests/lua_module.test.js` | **11/11** |
| Sync tests | `node --test ara-x/tests/sync.test.js` | **12/12** |
| Sync checker | `node ara-x/scripts/sync/check_sync_contract.js` | **43/43 · ALL CHECKS PASS** |

Sin `php -l`, `luac -p` ni `nginx -t`: **NOT_RUN** (no hay PHP/Lua local ni ventana; no se declaran PASS).

## 4. Estado de los findings tras t26/t28/t30

| Finding | Estado | Evidencia |
|---|---|---|
| **F-02** (credenciales en `reports/r1_evidence/**`) | **REMEDIADO por t26** | scanner 0 findings en 102 archivos; `r1_selfcheck` 102/102; `r1_evidence` redactado; no se reproduce ningún valor |
| **F-03** (Lua `require("ape_attr")` side effect) | **REPARADO por t28** | 0 `require` de `ape_attr`; SHA-256/HMAC embebidos; checker 117/117; lua tests 11/11 |
| **F-04** (extras top-level en respuesta Lua) | **REPARADO por t28 + test alineado en t30** | 0 `soc_canonical`; `validatePolicy` rechaza extras; 13/13 |
| **F-06** (zone `ara_sync_lua`) | **REPARADO por t28** | zone presente 3r/m; checker 117/117 |
| **F-07** (Retry-After) | **REPARADO por t28** | Lua y snippets con `Retry-After`; gates verdes |
| **F-08** (PHP `device_ids`) | **REPARADO por t28** | binding no vacío; checker 43/43 |
| **F-10/F-11** (parser/`lab_content`) | **REPARADO por t28** | parser estricto; sin content inyectado; gates verdes |
| **F-05** (clave global Lua sin per-device) | **NO-GO documentado, NO arreglado** | t28 + `ara-x/vps/lua/README.md`; producción NO-GO hasta B2/B3 |
| **F-01** (par cuenta/clave en path + CORS + cache) | **NO-GO de owner/producción, NO arreglado** | `V3_repair_t26.md` §4.1; rotar par, quitar CORS, cache private/noindex |
| **F-09** (R3-R4/R5/R6/R7 VPS) | **NO-GO de owner/VPS, NO arreglado** | `V3_repair_t26.md` §4.2; deny comentado, `/cdn/`, watchdog, APKs |

`F-01` y `F-09` **no** se declaran arreglados. La suite verde no mitiga la exposición del par en la lista
pública ni los riesgos de VPS; el veredicto de producción sigue **NO-GO** hasta rotación/ventana.

## 5. Conclusión

- **T29-B1 cerrado**: el assert ya no exige el defecto; la suite global vuelve a 191/189/0/2.
- **Sin cambios** en `ara-x/vps/**`, `ara-x/reports/V3_security.md` ni `r1_evidence` (fuera de scope).
- **Sin secretos reproducidos**, sin commit, sin deploy, sin VPS.
- **t30 PASS**; t27 (re-auditoría) puede re-ejecutar los gates y firmar el veredicto final.
