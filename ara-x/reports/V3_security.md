# V3 · Revisión de seguridad, secretos y headers — ARA-X (r2)

Fecha: 2026-10-30 · Auditor: `security-auditor` (S10) · Tarea: **t27 · verification-round-2**
Scope: `ara-x/reports/V3_security.md` + `ara-x/scripts/security/` (re-auditoría repo-only). VPS **solo** como fuente documentada en R3; `ara-x/vps/**`, `r1_evidence/**` y `security.test.js` son **out-of-scope** de escritura.

> **Veredicto final V3-R2: PASS (reparables de repo cerrados).**
> **Deploy de producción: NO-GO** por **F-01** (CRITICAL: par cuenta/clave en path de 10.631 URLs + CORS `*` +
> cache pública), **F-05** (clave global Lua sin store por dispositivo; B2/B3) y **F-09** (R3-R4/R3-R5/R3-R6/R3-R7
> de VPS). F-01/F-05/F-09 **no se declaran arreglados**; son bloqueos de owner/producción, no reparaciones de repo.

---

## 1. Método y límites

- **Re-auditoría estática/ejecutable** sobre el estado post-t28/t30, sin red y sin VPS.
- **Ejecutado**: `security.test.js`, suite global, `scan_secrets`, `r1_selfcheck`, checkers Lua/sync, `node --check`.
- **No ejecutado**: `php -l`, `luac -p`, `nginx -t` → **NOT_RUN** (no hay PHP/Lua/ventana local); no se declaran PASS.
- **Sin secretos reproducidos**: R1 evidencia y URLs del par cuenta/clave se citan solo por archivo/línea y forma;
  `ape_attr.key`/`ara_sync.key` no se copiaron. **Sin deploy, sin reload, sin commit, sin escrituras al VPS.**

---

## 2. Veredicto y aceptación

| Criterio de aceptación (t27) | Estado | Evidencia |
|---|---|---|
| **F-02**: `scan_secrets` 0 findings; `r1_evidence` sin URLs de credencial; `r1_selfcheck` 102/102; suite global 191/189/0/2 | **PASS** | scanner 106 archivos · 0 findings; `r1_selfcheck` 102/102; global 191 · 189 pass · 0 fail · 2 skip |
| **F-03..F-11** verificados con test/checker (Lua sin side-effect, schema, zone, Retry-After, PHP `device_ids`, parser/`lab_content`) | **PASS** | lua checker **117/117**, lua tests **11/11**, sync tests **12/12**, sync checker **43/43**; inspección §6 |
| **t30**: assert de `security.test.js` alineado a F-04 (no exige `soc_canonical`); suite verde | **PASS** | `security.test.js:358` usa `assert.equal(/soc_canonical/.test(lua), false, ...)`; 13/13; global 191/189 |
| **F-01/F-09** documentados NO-GO de producción/owner con acciones; no arreglados | **PASS (revisión)** | §5; `V3_repair_t26.md` §4.1/§4.2; acciones rotación/CORS/cache/deny R3-R4/R3-R5 |
| Veredicto PASS/FAIL explícito; sin deploy/commit/VPS; NOT_RUN justificados; sin secretos | **PASS** | **PASS repo / NO-GO producción**; §1, §8, §9 |

**Conclusión:** los hallazgos reparables de repo están cerrados; **V3-R2 pasa**. La entrega **no es desplegable**:
F-01, F-05 y F-09 siguen abiertos y exigen owner/proveedor/ventana. La suite verde no mitiga esas exposiciones.

---

## 3. Estado de findings (V3-R2)

| ID | Sev. | Estado V3-R2 | Evidencia / decisión |
|---|---|---|---|
| **V3-F-01** | **CRITICAL** | **ABIERTO · NO-GO producción** | Par cuenta/clave constante en el path de 10.631 URLs (`/cdn/<host>/live/<seg6>/<seg6>/<id>`) + `Access-Control-Allow-Origin: *` + cache pública. R1 líneas 43-46/385-391; R6 §2.1/§3. **No se reproduce ningún valor.** Acciones: rotar par, regenerar lista, quitar ACAO/ACAM/ACAH/ACAE, `Cache-Control: private` + `X-Robots-Tag`, valorar URLs firmadas/allowlist. |
| **V3-F-02** | HIGH | **CERRADO (t26)** | `reports/r1_evidence/{cdn_full,local_full}.json` fueron redactados; scanner **0 findings** en 106 archivos; `r1_selfcheck` 102/102. No se reproduce ningún valor. Se mantiene la recomendación de `.gitignore` para `r1_evidence/**` (higiene, ya sin credenciales). |
| **V3-F-03** | HIGH | **CERRADO (t28)** | `vps/lua/ara_x_sync.lua`: **0** `require` de `ape_attr`; SHA-256/HMAC embebidos; no auto-serve. Lua checker 117/117; lua tests 11/11. |
| **V3-F-04** | HIGH | **CERRADO (t28 + t30)** | Respuesta Lua solo con campos del schema; `soc_canonical` **0** ocurrencias; `validatePolicy` real acepta el fixture; test t30 verifica ausencia. 13/13; global 191/189. |
| **V3-F-05** | MEDIUM | **ABIERTO · NO-GO producción** | Variante Lua usa una clave global (`/etc/nginx/lua/ara_sync.key`) sin `key_id`/store por dispositivo; B2/B3 sin resolver. **No se declara arreglado**; README Lua y t28 lo documentan. No es reparable en repo sin enrolamiento/store. |
| **V3-F-06** | MEDIUM | **CERRADO (t28)** | `ara-sync-zone.conf` define `zone=ara_sync_lua:1m rate=3r/m` + `limit_req_status 429`; snippet la usa; sin playback. Lua checker 117/117. |
| **V3-F-07** | LOW | **CERRADO (t28)** | `Retry-After: 30` en ambos snippets `/sync` y en el 429 propio Lua; test Lua F-07. |
| **V3-F-08** | MEDIUM | **CERRADO (t28)** | PHP exige `device_ids` array no vacío + binding exacto + key store 0600; `null` → 401 uniforme. Sync checker 43/43. |
| **V3-F-09** | MEDIUM (VPS) | **ABIERTO · NO-GO owner/VPS** | R3-R4 `\n` deja comentado el deny de `/iptv-ape/`; R3-R5 `/cdn/` acepta hosts públicos; R3-R6 watchdog reload/restart; R3-R7 APKs servibles. Sin cambios; acciones en §5.2. |
| **V3-F-10** | LOW | **CERRADO (t28)** | Lua `jint` entero estricto, `scan_top_keys` (extra/duplicadas/trailing) y `soc=unknown` exige `soc_raw`; lua tests 11/11. |
| **V3-F-11** | LOW | **CERRADO (t28)** | Lua no lee/inyecta `lab_content` ni emite `content`; lua tests 11/11. |
| **V3-F-12** | INFO | **VIGENTE** | Controles correctos: PHP `hash_equals`, nonce histórico, idempotencia 200 exacto vs 409, `BEGIN IMMEDIATE`, 16 KB, no-store/nosniff, sin CORS/red/exec; 0 tóxicos en EXTHTTP/entrega; bloque ARA sin secretos/ADB. Preservar. |

---

## 4. HMAC, canonicalización, replay e idempotencia (post-repair)

| Capa | Verificación | Resultado |
|---|---|---|
| Cliente JS | canónicos `ARA-X-SYNC-V1` / `ARA-X-SYNC-RESP-V1`; vector HMAC; `verifyResponseSignature` timing-safe; freshness device/seq/ts/TTL; `assertNoUrlKeys`; `never_downscale`/8K | **PASS** (`sync_contract` 37/37; `sync_security` 23/23) |
| PHP staged | raw body hash + device/seq/ts/nonce; `hash_equals`; nonce 600 s; idempotencia 120 s **antes** de nonce/seq; `BEGIN IMMEDIATE`; 16 KB; 415/413/409/503; `device_ids` binding + store 0600 | **PASS estático**; `php -l` NOT_RUN |
| Lua staged | SHA-256/HMAC embebidos (sin `ape_attr`); canónico D3; nonce 600; replay 120; `jint`/`scan_top_keys`; 8K solo `presentation_only`; 16 KB; `pcall(handle)`; 401/409/413/429/503 | **PASS estático**; `luac -p`/`nginx -t` NOT_RUN |
| Mock F-06 | nonce histórico; idempotencia exacta 200 vs 409; replay `seq` mayor; rate 429 | **PASS** (casos 05/07/08/22) |

**Canonical exacto:** `ARA-X-SYNC-V1\n{device_id}\n{seq}\n{ts}\n{nonce}\n{sha256_hex(raw_body)}`;
respuesta `ARA-X-SYNC-RESP-V1\n{device_id}\n{req_seq}\n{resp_ts}\n{sha256_hex(raw_body)}`.
`X-ARA-Sig` = 64 hex lowercase; `X-ARA-Key-Id` obligatorio en PHP; `Authorization: Bearer` **no** autentica
`/sync` (caso 03). El prefijo V1 no se cambió.

**F-06**: cerrado en mock v2 y PHP staged; el mock no es producción. El rate real usa `$binary_remote_addr`, no
el `X-ARA-Key-Id` del cliente, evitando el bypass de bucket del mock.

---

## 5. F-01 / F-05 / F-09 · NO-GO de producción/owner (no arreglados)

### 5.1 F-01 (CRITICAL) — lista pública con par cuenta/clave + CORS + cache

R1 mide la forma `/cdn/<host>/live/<seg6>/<seg6>/<id>.m3u8`: **1 valor constante por segmento de 6** y
**10.631 streamId**; es la forma Xtream cuenta/clave. No se reproduce ningún valor. Acciones, en orden:
1. **Rotar** el par cuenta/clave en el proveedor y regenerar la lista.
2. Quitar `Access-Control-Allow-Origin/Methods/Headers/Expose-Headers` de `/lists/` y `.m3u8`.
3. `Cache-Control: private, max-age=300` (una sola cabecera) + `X-Robots-Tag: noindex, nofollow`.
4. Valorar URLs firmadas / allowlist / entrega autenticada por el VPS.
5. **NO-GO** hasta rotación + verificación de 0 credenciales en artefactos públicos.

### 5.2 F-09 (MEDIUM, VPS) — R3-R4/R3-R5/R3-R6/R3-R7

| ID | Estado | Acción (ventana VPS) |
|---|---|---|
| R3-R4 | abierto | `deny all` de `/iptv-ape/` (logs, cache, modules, profiles, telemetry, mutations) comentado por `\n` literal en `sites-enabled/default:198`; corregir + `nginx -t`. |
| R3-R5 | abierto | `/cdn/` acepta cualquier host público; allowlist o deny fuera de hosts autorizados. `/sync` no acepta URLs (PHP `ara_sync_scan_urls`), así que no añade SSRF. |
| R3-R6 | abierto | watchdog puede `reload`/`restart` nginx; asumir interferencia y verificar `/_ape/health` post-reload. |
| R3-R7 | abierto | APKs servibles en `/ara/candidate` y `/ara/fluid`; retirar/limitar. |

**Ninguno se declara arreglado**; write-scope VPS prohibido. Contribuyen al NO-GO de producción.

### 5.3 F-05 (MEDIUM) — clave global Lua

`ara-x/vps/lua/README.md` y t28 documentan: una sola clave para todos los dispositivos (`ara_sync.key`), sin
`key_id`/store por dispositivo. No es autenticación por dispositivo (B2/B3) y **no se declara resuelta**. La
variante Lua es diagnóstica/staged; no desplegar como endpoint de producción. La referencia sigue siendo el PHP
staged, y aun así el deploy es NO-GO hasta F-01/F-09 + store por dispositivo.

---

## 6. F-03..F-11 · verificación del repair t28

| Finding | Verificación ejecutada | Resultado |
|---|---|---|
| F-03 | `grep require/ape_attr/M.serve` en Lua = 0; SHA-256/HMAC embebidos; lua checker 117/117; lua tests 11/11 | **PASS** |
| F-04 | `soc_canonical` = 0; `prov`/`conf` no top-level; fixture Lua pasa `client.validatePolicy`; test t30 verifica ausencia; 13/13 | **PASS** |
| F-06 | zone file define `ara_sync_lua` 3r/m + status 429; snippet usa la zona; lua checker 117/117 | **PASS** |
| F-07 | `add_header Retry-After 30 always` en `ara-sync.conf` y `ara-sync-lua.conf`; Lua 429 propio con header; lua tests 11/11 | **PASS** |
| F-08 | PHP `count($deviceIds) < 1` → 401; binding exacto; store `fileperms & 0077`; sync checker 43/43 | **PASS** |
| F-10 | Lua `jint` (`1.0`/`1e3`/`1.5` rechazados), `scan_top_keys`, `soc_raw` requerido; lua tests 11/11 | **PASS** |
| F-11 | Lua sin `lab_content`/`content_json`/`"content":`; lua tests 11/11 | **PASS** |

**Gates:** lua checker **117/117**, lua tests **11/11**, sync tests **12/12**, sync checker **43/43**.
`php -l`/`luac -p`/`nginx -t` = **NOT_RUN** (no PHP/Lua/ventana); no se declaran PASS.

---

## 7. F-02 · secretos y R1

- `node ara-x/scripts/security/scan_secrets.js` → **106 archivos · 0 findings** (incluye `reports/r1_evidence/**`).
- `node ara-x/scripts/forensics/r1_selfcheck.js` → **102/102 · ALL_OK**.
- `reports/r1_evidence/**` fue redactado por t26: sin URLs de credencial; no se reproduce ningún valor.
- La entrega sigue sin `user:pass@`, `username=`/`password=`, tokens/claves reales, PEM ni AWS keys.
- **Recomendación de higiene (no bloqueante):** añadir `reports/r1_evidence/` a `.gitignore` para evitar
  reincidencia; hoy el escáner ya da 0.

---

## 8. Checklist S10 (firmado)

| Dominio S10 | Estado V3-R2 | Evidencia |
|---|---|---|
| HMAC / canonical / key_id | **PASS** | PHP/cliente/Lua; vectores; `hash_equals`; `X-ARA-Key-Id` |
| Replay-window / nonce / idempotencia | **PASS** | casos 05/07/08/22; PHP nonce/replay; F-06 |
| Secretos / claves / credenciales | **PASS repo** (F-02 0) | scanner 106/0; R1 102/102; sin valores |
| CORS / cache / headers | **PASS repo / FAIL producción** | `/sync` sin CORS/no-store/nosniff; F-01 de `/lists/` sigue abierto |
| Headers tóxicos | **PASS** | 0 en EXTHTTP/bloque ARA/código |
| ADB remoto / ejecución desde playlist | **PASS** | bloque ARA sin ADB/shell; VPS code sin exec/red |
| Rate-limit sin bloquear playback | **PASS** | PHP/Lua 3r/m burst 6 solo `/sync`; sin límites `/lists/`/playback |
| Cache-control / minimización | **PASS staged** | no-store/nosniff; 16 KB; logs sin body/nonce |
| Playback intacto | **PASS** | snippets sin `/lists/`, `/cdn/`, `.ts`, `limit_conn` |
| Deploy producción | **FAIL / NO-GO** | F-01 CRITICAL, F-05, F-09 abiertos |

**Firma S10:** `security-auditor` · **Veredicto final: PASS (V3-R2 repo)** · **Producción: NO-GO**.
No se declara F-01/F-05/F-09 arreglados. Sin deploy/commit/VPS. Sin secretos reproducidos.

---

## 9. t30 · alineación del test (fuera de scope de escritura de t27)

`security.test.js:358` pasó de exigir el defecto (`assert.match(lua, /soc_canonical/)`) a:

```js
assert.equal(/soc_canonical/.test(lua), false, 'V3-F-04 reparado en t28: la respuesta Lua no añade extras');
```

Conserva la prueba semántica de que `client.validatePolicy` rechaza `soc_canonical`/`prov`/`conf`.
`security.test.js` **13/13**; suite global **191 · 189 pass · 0 fail · 2 skip**; informe:
`ara-x/reports/V3_repair_t29.md` (t30 PASS). t27 **no modificó** `security.test.js` (out-of-scope).

---

## 10. Comandos y resultados

```powershell
node --test ara-x/tests/security.test.js
# 13 tests · 13 pass · 0 fail · exit 0
node --test 'ara-x/tests/*.test.js'
# 191 tests · 189 pass · 0 fail · 2 skip · exit 0
node ara-x/scripts/security/scan_secrets.js
# 106 archivos · 0 findings · OK
node --check ara-x/scripts/security/scan_secrets.js
# exit 0
node ara-x/scripts/forensics/r1_selfcheck.js
# checks=102 pass=102 fail=0 · ALL_OK
node ara-x/scripts/lua/check_lua_module.js
# ALL CHECKS PASS (117/117)
node --test ara-x/tests/lua_module.test.js
# 11/11 pass
node --test ara-x/tests/sync.test.js
# 12/12 pass
node ara-x/scripts/sync/check_sync_contract.js
# ALL CHECKS PASS (43/43)
```

**NOT_RUN:** `php -l`, `luac -p`, `nginx -t` (sin PHP/Lua/ventana). **Sin VPS, sin deploy, sin commit** (HEAD
`2f8861c`; `ara-x/` untracked). No se reprodujeron valores sensibles.

---

## 11. Residuales y decisiones abiertas

1. **F-01**: rotación del par cuenta/clave (owner+proveedor) y regeneración de lista → bloquea producción.
2. **F-05**: store per-device/`key_id` para Lua (B2/B3) o retirar la variante Lua → producción NO-GO.
3. **F-09**: R3-R4 deny, R3-R5 `/cdn/` allowlist, R3-R6 watchdog, R3-R7 APKs → ventana VPS.
4. **Higiene**: añadir `reports/r1_evidence/` a `.gitignore`; mantener scanner en CI.
5. **HSTS**: decisión del owner; no bloquea players nativos.
6. **`php -l`/`luac -p`/`nginx -t`**: ejecutar en ventana antes de cualquier deploy; hoy NOT_RUN.

**Cierre:** V3-R2 **PASS de reparables de repo**, con la suite y los gates verdes. **Producción NO-GO** hasta
cerrar F-01/F-05/F-09. No se reprodujo ningún secreto y no se tocó VPS ni producción.
