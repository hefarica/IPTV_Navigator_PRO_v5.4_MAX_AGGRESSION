# V3 · Cierre de F-02 y follow-up de t26 (V3-R2b)

**Tarea:** `t29` (V3-R2b) · **Autor:** `hls-architect` · **Fecha:** 2026-10-30
**Origen:** re-scope de `t26` (falló por acceptance insatisfacible) · **Depende de:** `t28` (V3-R2, repair de `vps-edge`) · **Re-audita:** `t27`

**Veredicto de esta tarea:**
· **F-02 (evidencia R1 con credenciales): CERRADO** — `scan_secrets` 0 findings, `r1_evidence` sin URLs de credencial, `r1_selfcheck` 102/102.
· **T26-B2 (F-03…F-11 en `vps-edge`): CUBIERTO por t28**, con sus gates verificados en esta sesión; **F-05 no se declara arreglado** (t28 lo documenta NO-GO).
· **T26-B1 / F-01 y F-09: NO-GO de owner/producción**, documentado con acciones concretas; **no se declara arreglado**.
· **BLOQUEO T29-B1 (nuevo):** la suite global está **roja** por un test de V3 que sigue asertando el estado **pre-t28** de F-04 (`tests/security.test.js:358`), fichero **fuera del scope de t29**. Sin actualizar ese test, la acceptance “suite 190/188/0/2” no puede cumplirse sin mentir. **t29 no se declara completada**; se detalla la corrección exacta para el owner (§5).
· **Sin deploy, sin commit, sin VPS.**

> **ACTUALIZACIÓN (posterior, `t30`):** el bloqueo **T29-B1 quedó RESUELTO** por `t30` (owner `security-auditor`):
> `tests/security.test.js:358` ya no exige el defecto — ahora verifica que `/soc_canonical/` **no** está en el Lua.
> Estado verificado: `security.test.js` **13/13** y suite global **191 · 189 pass · 0 fail · 2 skipped · exit 0**.
> Informe: `ara-x/reports/V3_repair_t29.md`. Cierre documental consolidado: `ara-x/reports/V3_repair_t26_final.md`.

---

## 1 · Mapa de estado

| Bloque | Hallazgo | Estado tras t29 | Evidencia |
|---|---|---|---|
| **(a) F-02** | Credenciales en `r1_evidence/{cdn_full,local_full}.json` | **CERRADO** | §2 · scan 0/101 · selfcheck 102/102 |
| **(b) T26-B2** | F-03/04/06/07/08/10/11 (`vps-edge`) | **CUBIERTO por t28** (gates verificados) | §3 · 117/117 · 11/11 · 12/12 · 43/43 |
| **(b) F-05** | Clave global Lua (sin store por dispositivo) | **NO-GO documentado por t28** — no arreglado | §3.2 |
| **(c) T26-B1 / F-01** | Par cuenta/clave en el path de 10.631 URLs + CORS `*` + cache pública | **NO-GO de owner/producción** — no arreglado | §4.1 |
| **(c) F-09** | R3-R4 (deny comentado), R3-R5 (`/cdn/` sin allowlist) y R3-R6/R7 | **NO-GO de owner/VPS** — no arreglado | §4.2 |
| **(d) T29-B1** | Test de V3 obsoleto tras el fix de F-04 | **BLOQUEO** de la suite global | §5 |

---

## 2 · F-02 · cerrado (evidencia ya redactada)

La redacción se aplicó en t26 y **se re-verifica aquí** (no se volvió a modificar ningún byte):

| Fichero | Bytes | sha256 | URLs de credencial |
|---|---|---|---|
| `reports/r1_evidence/cdn_full.json` | 107.972 | `170DF79E…1132C80` | **0** |
| `reports/r1_evidence/local_full.json` | 107.868 | `843FBADD…7D548E8` | **0** |

- Se conservan todas las métricas forenses (572.170.477 / 568.241.457 B, 10.169.562 / 10.139.240 líneas, 10.631 canales,
  772 nombres de tag, `last_lines` = 8 entradas); las URLs afectadas quedaron como
  `https://iptv-ape.duckdns.org/cdn/<17c>/<4c>/<6c>/<6c>/<12c>` y `#EXTATTRFROMURL:…/a/2/<11c>/<10c>/P1/<166c>`.
- Regla aplicada (t26): sólo URLs con `/live/` o `/a/<n>/`; se conserva host y **longitud de cada segmento**, se elimina la query.

**Verificación:**
`node ara-x/scripts/security/scan_secrets.js` → **exit 0 · files: 101 · findings: 0 · skipped: 0**
`node ara-x/scripts/forensics/r1_selfcheck.js` → **checks=102 pass=102 fail=0 · ALL_OK**

---

## 3 · T26-B2 · cubierto por t28 (V3-R2), con verificación propia

t28 reparó `ara-x/vps/**` (staged, sin deploy). En esta sesión **re-ejecuté sus gates** en lugar de fiarme del resumen:

| Gate de t28 | Comando | Resultado |
|---|---|---|
| Checker del módulo Lua | `node ara-x/scripts/lua/check_lua_module.js` | **ALL CHECKS PASS (117/117)** · exit 0 |
| Tests Lua | `node --test ara-x/tests/lua_module.test.js` | **11 tests · 11 pass · 0 fail** · exit 0 |
| Tests sync | `node --test ara-x/tests/sync.test.js` | **12 tests · 12 pass · 0 fail** · exit 0 |
| Checker del contrato sync | `node ara-x/scripts/sync/check_sync_contract.js` | **ALL CHECKS PASS (43/43)** · exit 0 |

Comprobaciones estáticas adicionales (lectura, sin escribir en `vps/`):

| Hallazgo | Qué se comprobó | Resultado |
|---|---|---|
| **F-03** | `require("ape_attr")` en `vps/lua/ara_x_sync.lua` | **0 ocurrencias** (helper auto-serve eliminado) |
| **F-04** | `soc_canonical` en la respuesta Lua | **0 ocurrencias** (sólo campos del schema) |
| **F-06** | `limit_req_zone … zone=ara_sync_lua` en `vps/nginx/ara-sync-zone.conf` | **presente** (`rate=3r/m`) |
| **F-08** | `device_ids` obligatorio en `vps/php/ara-sync.php` | **implementado** (binding + comentario V3-F-08) |

**F-03/F-04/F-06/F-07/F-08/F-10/F-11: cubiertos por t28.** **F-05 no**: t28 documenta NO-GO (sigue habiendo clave global;
el store por dispositivo no está resuelto). Esta tarea **no declara F-05 arreglado**.

---

## 4 · T26-B1 / F-01 y F-09 · NO-GO (no arreglado)

### 4.1 F-01 (CRITICAL) — lista pública con par cuenta/clave + CORS + cache

**Sigue abierto.** Es una acción de **owner + proveedor + producción**, no un fix de repo. Acciones exigidas, en orden:

1. **Rotar el par cuenta/clave en el proveedor** y regenerar la lista (el par está expuesto en la lista pública).
2. **Quitar** `Access-Control-Allow-Origin/Methods/Headers/Expose-Headers` de `/lists/`.
3. **`Cache-Control: private, max-age=300`** (una sola cabecera) + **`X-Robots-Tag: noindex, nofollow`**.
4. Valorar URLs firmadas / allowlist / entrega autenticada por el VPS.
5. **NO-GO de producción** hasta rotación + verificación de 0 credenciales en artefactos públicos.

Esta tarea **no** toca producción y **no** declara F-01 arreglado. La redacción de evidencia (F-02) **no** mitiga F-01: el par
sigue comprometido en la lista servida.

### 4.2 F-09 (MEDIUM, VPS) — R3-R4/R3-R5/R3-R6/R3-R7

| ID | Estado | Acción (ventana VPS) |
|---|---|---|
| R3-R4 | **abierto** | `deny all` de `/iptv-ape/` comentado por `\n` literal (`sites-enabled/default:198`); corregir + `nginx -t` |
| R3-R5 | **abierto** | `/cdn/` acepta cualquier host público; allowlist o deny fuera de hosts autorizados |
| R3-R6 | **abierto** | watchdog puede `reload`/`restart` nginx; asumir interferencia y verificar `/_ape/health` |
| R3-R7 | **abierto** | APKs servibles en `/ara/candidate` y `/ara/fluid`; retirar/limitar |

**NO-GO** documentado; ninguno se declara arreglado y ninguno se tocó (write-scope VPS prohibido).

---

## 5 · T29-B1 · bloqueo de la suite global (test de V3 obsoleto tras t28)

**Síntoma:** `node --test ara-x/tests/*.test.js` → **191 tests · 188 pass · 1 fail · 2 skipped** (el contrato esperaba
190/188/0/2). El único fallo:

```
✖ Lua response con extras top-level es rechazada por el cliente (V3-F-04)
  AssertionError: The input did not match the regular expression /soc_canonical/
```

**Causa:** `ara-x/tests/security.test.js:358` aserta que **el módulo Lua sigue conteniendo el defecto** V3-F-04:

```js
const lua = read('vps/lua/ara_x_sync.lua');
assert.match(lua, /soc_canonical/);   // ← línea 358: estado PRE-t28
```

t28 **arregló F-04** (la respuesta Lua ya no añade `soc_canonical`/`prov`/`conf`), así que ese `assert.match` es ahora
falso: el test exige que el bug exista. La parte semántica del test (el cliente rechaza extras) **sí pasa**: verificado
`client.validatePolicy(example+{soc_canonical})` → **RECHAZA**. El fallo es de **estado esperado**, no del cliente ni de t28.

**Por qué t29 no lo corrige:** `ara-x/tests/security.test.js` está **explícitamente fuera del scope de t29**.
**Corrección exacta recomendada** (owner: `security-auditor` / t27; 1 línea):

```js
// línea 358 — antes (pre-t28):
assert.match(lua, /soc_canonical/);
// después (post-t28, coherente con F-04 reparado):
assert.equal(/soc_canonical/.test(lua), false, 'V3-F-04 reparado en t28: la respuesta Lua no añade extras');
```

Con eso la suite vuelve a **191 tests · 189 pass · 0 fail · 2 skipped** (el test nº 191 lo añadió t28 al pasar de 10 a 11
tests Lua) y la acceptance “suite verde” queda satisfecha. Alternativa: que t27 reescriba ese bloque como parte de su
re-auditoría (es su artefacto y su veredicto).

**Consecuencia:** `t29` **no se declara completada**. Todo lo demás de su acceptance está hecho y verificado (§2–§4); el
único item que no puede pasar sin tocar un fichero fuera de scope es “suite global 190/188/0/2”.

---

## 6 · Comandos ejecutados en esta tarea

```powershell
node ara-x/scripts/security/scan_secrets.js          # exit 0 · files:101 · findings:0
node ara-x/scripts/forensics/r1_selfcheck.js         # 102/102 · ALL_OK · exit 0
node --test ara-x/tests/security.test.js             # 12 pass · 1 fail (T29-B1, línea 358) · exit 1
node --test 'ara-x/tests/*.test.js'                  # 191 · 188 pass · 1 fail · 2 skipped · exit 1
node ara-x/scripts/lua/check_lua_module.js           # ALL CHECKS PASS (117/117) · exit 0
node --test ara-x/tests/lua_module.test.js           # 11/11 · exit 0
node --test ara-x/tests/sync.test.js                 # 12/12 · exit 0
node ara-x/scripts/sync/check_sync_contract.js       # ALL CHECKS PASS (43/43) · exit 0
```

**Sin commit, sin deploy, sin escrituras en el VPS.** No se reproduce ningún valor sensible en este informe.

---

## 7 · Enlaces

- `ara-x/reports/V3_security.md` — veredicto original (FAIL / NO-GO) y findings F-01…F-12.
- `ara-x/reports/V3_repair_r2.md` — reparación de F-02 en t26 y mapa (a)(b)(c).
- **t28 (V3-R2)** — repair de `vps-edge` F-03/04/06/07/08/10/11 (staged, sin deploy); F-05 NO-GO.
- **t27** — re-auditoría de seguridad: debe re-ejecutar la suite y, si acepta el estado post-t28, actualizar
  `tests/security.test.js:358` (T29-B1) antes de firmar.
