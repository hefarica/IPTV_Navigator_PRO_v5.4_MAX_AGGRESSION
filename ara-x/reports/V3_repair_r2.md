# V3 · Reparación r2 (t26) — alcance, evidencia y NO-GO

**Tarea:** `t26` (repair r2, derivada de `t19`/V3) · **Autor:** `hls-architect` · **Fecha:** 2026-10-30
**Estado:** **F-02 CERRADO en repo** (0 credenciales reales en la evidencia R1) · **F-01/F-09 = NO-GO documentado** (acción de owner/producción, no fix de repo) · **F-03…F-08/F-10/F-11 = NO CUBIERTOS por t26** (paths de `vps-edge`), no se declaran arreglados · **sin deploy, sin tocar VPS**.

> Este informe **no cambia el veredicto de V3**: el gate de seguridad sigue **FAIL** y el deploy de producción sigue **NO-GO**
> mientras F-01 (CRITICAL) y los hallazgos de `vps/lua`/`vps/php` permanezcan abiertos. t27 re-audita.

---

## 1 · Mapa de propiedad aplicado

| Bloque | Hallazgos | Owner | Qué hace t26 |
|---|---|---|---|
| **(a) Repo — evidencia R1** | **V3-F-02** (HIGH): URLs con el par cuenta/clave en `reports/r1_evidence/{cdn_full,local_full}.json` (`last_lines`) | `hls-architect` | **Redactado y verificado** (§2) |
| **(b) Repo — `vps-edge`** | **V3-F-03/04/05/06/07/10/11** (`ara-x/vps/lua/ara_x_sync.lua`, `ara-x/vps/nginx/…`) y **V3-F-08** (`ara-x/vps/php/ara-sync.php`) | `vps-edge-engineer` | **NO cubierto**: t26 no toca esos paths; **no se declara fix** (§4) |
| **(c) Producción / owner** | **V3-F-01** (CRITICAL): par cuenta/clave en el path de las 10.631 URLs + CORS `*` + cache pública · **V3-F-09** (R3-R4/R5/R6/R7) | owner + proveedor + VPS | **NO-GO documentado**; no es un fix de repo (§3) |

---

## 2 · V3-F-02 · evidencia R1 redactada (cerrado)

### 2.1 Qué había (sin reproducir valores)

`ara-x/reports/r1_evidence/` (9 JSON) contenía **dos** cadenas con credenciales reales, ambas en el campo
`last_lines` (cola literal del artefacto que R1 guardó como evidencia):

| Fichero | Campo | Forma (enmascarada) |
|---|---|---|
| `cdn_full.json` | `last_lines[2]` | `https://iptv-ape.duckdns.org/cdn/<17c>/<4c>/<6c>/<6c>/<12c>` |
| `local_full.json` | `last_lines[1]` | idem (misma URL de canal) |
| `local_full.json` | `last_lines[2]` | `#EXTATTRFROMURL:https://iptv-ape.duckdns.org/a/2/<11c>/<10c>/P1/<166c>` |

`scan_secrets.js` (V3) reportaba **2 `credential_path`**; `git check-ignore` = NOT_IGNORED. El resto de
`ara-x/**` ya estaba limpio (0 hallazgos en 96 archivos).

### 2.2 Transformación aplicada (determinista, sólo URLs con credencial)

Regla exacta: en **todos** los strings de los dos JSON, cada URL que contenga `/live/` o `/a/<n>/` se sustituye por su
**forma enmascarada** — se conservan esquema, host y la **longitud de cada segmento** (`<Nc>`), se elimina la query
(`?<redacted-query>`). Ninguna otra clave se toca.

```
https://iptv-ape.duckdns.org/cdn/<17c>/<4c>/<6c>/<6c>/<12c>
#EXTATTRFROMURL:https://iptv-ape.duckdns.org/a/2/<11c>/<10c>/P1/<166c>
```

- Strings modificados: **1** en `cdn_full.json`, **2** en `local_full.json` (total 3).
- Se preservan **todas** las métricas forenses: `bytes` (572.170.477 / 568.241.457), `lines` (10.169.562 / 10.139.240),
  `channels.count` 10.631, `tag_counts` (772 nombres), `last_lines` (8 entradas), `urls.hosts`, `dedup`, `ext_http`, etc.
- Tamaños: `cdn_full.json` 107.977 → 107.954 B · `local_full.json` 108.088 → 107.850 B. Ambos JSON siguen siendo válidos.

### 2.3 Verificación (ejecutada)

| Comprobación | Resultado |
|---|---|
| `node ara-x/scripts/security/scan_secrets.js --json` (V3, 97 archivos) | **`ok:true`, `findings: []`, exit 0** (antes: 2 `credential_path`, exit 1) |
| Escaneo propio más estricto sobre los 9 JSON de `r1_evidence` (`/live/<seg>/<seg>/`, `/a/<n>/<seg>/<seg>/`, `user:pass@`, base64 ≥60) | **0 hallazgos** |
| JSON válidos y estructura íntegra | 9/9 parsean; claves y conteos intactos |
| Regresión R1 | `node ara-x/scripts/forensics/r1_selfcheck.js` → **102/102 PASS · ALL_OK** |
| Suite de la capa de lista (verify del contrato) | `node --test ara-x/tests/playlist.test.js` → **23 tests · 22 pass · 0 fail · 1 skip**, exit 0 |
| `node --check` (inyector/validador) | exit 0 / exit 0 |

**Riesgo residual:** el directorio sigue **sin** regla en `.gitignore` (`git check-ignore` = NOT_IGNORED), pero ya **no
contiene credenciales** (sólo host + longitudes de segmento). Si se quiere defensa en profundidad, añadir
`ara-x/reports/r1_evidence/` al `.gitignore` es una decisión de higiene, no un requisito de seguridad tras la redacción.

### 2.4 Ajuste del test de V3 (`tests/security.test.js`) — coherencia post-reparación

El test `secret scan: 0 en entrega; 2 credential_path raw en R1 evidence (documentado)` **asertaba el estado
pre-reparación** (`full.findings.length === 2` con `kind = ['credential_path','credential_path']`). Tras la redacción el
escáner devuelve 0 y ese test se volvía rojo (V1: `0 !== 2`, suite 190 tests / 1 fail), bloqueando el gate estático.

**Cambio mínimo aplicado** (mismo archivo, mismo bloque §9, sin tocar el resto de V3): el test pasa a asertar el estado
**post-reparación** — `delivery` 0 findings, `full` (incluyendo `reports/r1_evidence/**`) **0 findings**, las dos JSON de
evidencia siguen existiendo con `last_lines` y **ninguna** conserva `/live/<seg>/<seg>/`, y la remediación está documentada
(`V3_security.md` mantiene el finding V3-F-02; `V3_repair_r2.md` lo marca como remediado). El veredicto de V3 **no** se toca:
sigue FAIL/NO-GO por F-01 y por los hallazgos de `vps-edge`.

Motivo: dejar un test que exige la existencia de una credencial real en el repo es incompatible con “0 credenciales reales”
y mantendría la suite roja de forma permanente. t27 (security-auditor) re-audita y puede reescribir el test como parte de su
veredicto; el estado actual es el **hecho** post-reparación.

Resultado: `node --test ara-x/tests/security.test.js` → **13/13 PASS**; suite completa `ara-x` → **190 tests · 188 pass ·
0 fail · 2 skipped · exit 0**.

---

## 3 · V3-F-01 y V3-F-09 · NO-GO documentado (no “arreglado”)

### 3.1 V3-F-01 (CRITICAL) — exposición de la lista pública

Medido (R1/R6): la lista de 10.631 canales sirve un **par cuenta/clave constante en el path** (`/cdn/<host>/live/<seg6>/<seg6>/<id>`),
con `Access-Control-Allow-Origin: *` y `Cache-Control: public, max-age=300`. Cualquier origen web puede leer el par y usarlo
contra el proveedor. **No se puede corregir editando el repo**: exige acción del owner y del proveedor.

Acciones exigidas (owner/producción), en orden:

1. **Rotar el par cuenta/clave en el proveedor** y regenerar la lista (la lista pública ya lo expone).
2. **Quitar** `Access-Control-Allow-Origin/Methods/Headers/Expose-Headers` de `/lists/`.
3. `Cache-Control: private, max-age=300` (una sola cabecera) + `X-Robots-Tag: noindex, nofollow`.
4. Valorar URLs firmadas / allowlist / servir la lista por el VPS con auth de dispositivo.
5. **NO-GO** hasta rotación + verificación de 0 credenciales en artefactos públicos.

**t26 no hace nada de esto y no lo declara hecho.** Es bloqueante de producción.

### 3.2 V3-F-09 (MEDIUM, VPS) — R3-R4/R3-R5/R3-R6/R3-R7

| ID | Estado | Acción (ventana VPS) |
|---|---|---|
| R3-R4 | abierto | `deny all` de `/iptv-ape/` comentado por `\n` literal en `sites-enabled/default:198`; corregir + `nginx -t` |
| R3-R5 | abierto | `/cdn/` acepta cualquier host público (SSRF/abuso); allowlist o deny fuera de hosts autorizados |
| R3-R6 | abierto | `ape-meta-watchdog` puede `reload`/`restart` nginx; asumir interferencia y verificar `/_ape/health` |
| R3-R7 | abierto | APKs servibles en `/ara/candidate` y `/ara/fluid`; retirar/limitar antes de producción |

**t26 no toca el VPS** (ni siquiera lectura en esta ronda). Siguen abiertos y contribuyen al NO-GO.

---

## 4 · Hallazgos de `vps-edge` NO cubiertos por t26

Estos siete viven en paths que **no pertenecen a t26** y **no se han modificado ni se declaran arreglados**:

| ID | Sev. | Path | Qué exigiría |
|---|---|---|---|
| V3-F-03 | HIGH | `ara-x/vps/lua/ara_x_sync.lua` (+ `ape_attr` helper) | extraer SHA-256/HMAC a módulo sin side effects o guardar el auto-serve; test de carga |
| V3-F-04 | HIGH | `ara-x/vps/lua/ara_x_sync.lua` + `sync_response.schema.json` | quitar `soc_canonical`/`prov`/`conf` del top-level o versionar schema y firmarlos |
| V3-F-05 | MEDIUM | `ara-x/vps/lua/ara_x_sync.lua` | store de claves por dispositivo (`key_id`) en vez de la clave global |
| V3-F-06 | MEDIUM | `ara-x/vps/nginx/ara-sync-lua.conf` (+ zone file) | añadir `limit_req_zone ara_sync_lua 3r/m` + `limit_req_status 429`, o retirar la variante Lua |
| V3-F-07 | LOW | `ara-x/vps/nginx/ara-sync.conf` | `Retry-After` en el 429 de `/sync` |
| V3-F-08 | MEDIUM | `ara-x/vps/php/ara-sync.php` | `device_ids` no vacío obligatorio + verificación de modo/owner del key store |
| V3-F-10 | LOW | `ara-x/vps/lua/ara_x_sync.lua` | paridad de validación con PHP (enteros, claves extra, schema profundo) |
| V3-F-11 | LOW | `ara-x/vps/lua/ara_x_sync.lua` | `lab_content` no escribible desde request / validado |

Estado: **abiertos**. La variante Lua sigue **NO desplegable**; la referencia sigue siendo el PHP staged (que también
requiere V3-F-08 antes de producción).

---

## 5 · Qué queda verificado y qué no

**Verificado en esta reparación:** 0 credenciales reales en `ara-x/reports/r1_evidence/**` según el escáner de V3 y un
escaneo propio más estricto; JSON válidos; métricas forenses intactas; R1 selfcheck 102/102; suite de playlist verde;
`node --check` limpio en inyector y validador.

**No verificado / fuera de alcance:** `php -l`, `luac -p`, `nginx -t` (no hay PHP/Lua/ventana local) · ningún endpoint del
VPS · rotación del par · CORS/cache de producción · refactor del helper Lua · key store por dispositivo.

**Veredicto global: sin cambios — V3 sigue FAIL y producción NO-GO.** t27 re-audita; no hay deploy.

---

## 6 · Comandos ejecutados

```powershell
node ara-x/scripts/security/scan_secrets.js --json
# ok:true · files:97 · findings:[] · exit 0

node ara-x/scripts/forensics/r1_selfcheck.js
# checks=102 pass=102 fail=0 · ALL_OK

node --test ara-x/tests/playlist.test.js
# tests 23 · pass 22 · fail 0 · skipped 1 · exit 0

node --check ara-x/playlist/ara_x_injector.js    # exit 0
node --check ara-x/playlist/ara_x_validator.js   # exit 0
```

**Sin commit, sin deploy, sin escrituras en el VPS.** No se reprodujo ningún valor sensible en este informe.
