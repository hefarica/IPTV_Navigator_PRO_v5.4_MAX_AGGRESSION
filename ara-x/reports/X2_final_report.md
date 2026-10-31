# X2 · Paquete de entrega ARA-X y reporte final

**Tarea:** `t23` (X2 · integración) · **Autor:** `integration-verifier` · **Fecha:** 2026-10-30 (America/Bogota)
**Repo:** `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · **Rama:** `feat/adb-generic-visual-enhancement-installer` · **HEAD = origin:** `083b07b`
**Veredicto del paquete: PASS (ZIP probado + manifiesto íntegro) · Deploy de producción: NO-GO.**
**Sin commit, sin push, sin deploy, sin escrituras al VPS.** Este reporte y el preflight de deploy están fuera del ZIP (auto-referencia): el ZIP cita su propio `sha256` en `MANIFEST.json`.

---

## 0 · Resumen ejecutivo

| Dato | Valor |
|---|---|
| ZIP | `ARA_X_DELIVERY_20261030_222000.zip` · **3.119.531 B** |
| sha256 del ZIP | `c014c46fe49e3bba31c506ae4a3543c232b1af0cfe63680414609061cdfc3362` |
| Manifiesto por archivo | `MANIFEST_SHA256.txt` · **13.089 B** · sha256 `f7f4481370c65316ae00054fccc01083066921f09c22219674cb74f3b9265a71` · **120 entradas** · 21.339.375 B de payload |
| Manifiesto de evidencia | `EVIDENCE_MANIFEST.json` · **2.321 B** · sha256 `b8a20660f776d71e0be46cee56647c2cd6d71cdfd459ec0802d9f7eda7a3bfee` · **10 archivos / 4.715.998.572 B** (no empaquetados) |
| Prueba del ZIP | `Expand-Archive` **OK** · `tar -tf` 121 entradas · `VERIFY_PACKAGE.js` **120/120 archivos, 0 fallos, exit 0** |
| Secretos | scanner V3 sobre el staging: **117 archivos, 0 findings, exit 0**; scanner repo post-reporte: **0 findings** (`secret_scan_repo.json`) |
| Deploy | **NO-GO** por F-01/F-05/F-09 (owner/producción) · `ara-x/vps/**` staged, no instalado |

Exclusiones declaradas del ZIP: `ara-x/evidence/**` (4,72 GB; capturas con el par cuenta/clave en el path, V3-F-01), `ara-x/deliverables/**` (este directorio) y `ara-x/reports/X2_final_report.md` (auto-referencial). Todo lo demás de `ara-x/` (specs, implementaciones, tests, scripts, reportes R1–R6, ADC, contratos D1–D5, V1-R/V2/V3-R2, integración X1) va dentro y está hasheado.

---

## 1 · Entregables (hashes de salida)

| Archivo | Bytes | sha256 |
|---|---|---|
| `ara-x/deliverables/ARA_X_DELIVERY_20261030_222000.zip` | 3.119.531 | `c014c46fe49e3bba31c506ae4a3543c232b1af0cfe63680414609061cdfc3362` |
| `ara-x/deliverables/MANIFEST_SHA256.txt` | 13.089 | `f7f4481370c65316ae00054fccc01083066921f09c22219674cb74f3b9265a71` |
| `ara-x/deliverables/EVIDENCE_MANIFEST.json` | 2.321 | `b8a20660f776d71e0be46cee56647c2cd6d71cdfd459ec0802d9f7eda7a3bfee` |
| `ara-x/deliverables/MANIFEST.json` | 6.134 | `3d68bade3366fa034299e288cabd7912b6512144a065475e649d1fd71623bc70` |
| `ara-x/deliverables/BUILD_SUMMARY.json` | 5.334 | `af1ca0c98f707ad0bc9563f8c7ff54e57bfd2413831b7551bb0241b40990008f` |
| `ara-x/deliverables/VERIFY_PACKAGE.js` | 4.216 | `b7414b510f9080e486037e15deee7bac06f3c2ffb1b390301de34b3b09d62c95` |
| `ara-x/deliverables/PACKAGE_README.md` | 2.632 | `359b15e9314b924839690b075718b9e7f2905f55ae4732fa0a6b3a89481ad7c8` |
| `ara-x/deliverables/build_package.ps1` | 11.490 | `f93b3541e7cc0efe43e2e2d03406eacb4176517367819fc423095f88398c337c` |
| `ara-x/deliverables/secret_scan_stage.json` | 164 | `dcc7d03974a4b6ff7919f7384b2f142efdc39dc06d4dee4203578c29f09580bd` |
| `ara-x/deliverables/verify_package_result.json` | 264 | `8d2e2ae69f9192163b0c731624088eb2e6064778e1e55dca22f592668c552309` |
| `ara-x/reports/DEPLOY_PENDING_SINCE_25OCT.md` | 8.625 | `89aca45cda3a527cbc0cd28c98c4cdb75ee8eedf02c4f01549dfe026c7ce1076` |

Composición del payload: **120 archivos / 21.339.375 B**; dentro del ZIP también viajan `MANIFEST_SHA256.txt`, `EVIDENCE_MANIFEST.json`, `PACKAGE_README.md` y `VERIFY_PACKAGE.js`. El manifiesto **no se lista a sí mismo** (por eso `VERIFY_PACKAGE` reporta `extras: ["ara-x/MANIFEST_SHA256.txt"]`, esperado).

**Reproducibilidad del paquete (honesta):** con el mismo `-Stamp` el **manifiesto es determinista** (dos builds consecutivos dieron el mismo sha256 `f7f44813…`), pero **el ZIP no es byte-idéntico** entre builds porque `Compress-Archive` embebe metadatos de compresión. La integridad se ancla al manifiesto + al sha256 registrado; reconstruir no está pensado para reproducir el mismo sha del ZIP, sino el mismo contenido hasheado.

---

## 2 · Estado por categoría (implementado / staged / imposible / NOT_RUN)

### 2.1 Implementado y verificado (PASS)

| Bloque | Entregable incluido en el ZIP | Evidencia (hash / veredicto) |
|---|---|---|
| R1 forense de listas A/B | `reports/R1_list_forensics.md` (+ `R1_findings.json`, `r1_evidence/**`) | sha256 `305c8ee6…7aa5fd24` · 40.336 B; comparación A/B, 102/102 selfcheck |
| R2 verdad codec/HDR | `reports/R2_codec_truth.md` + `spec/4k8k_matrix.json` | `193bf597…537b7cd8` · 33.087 B; `878054c6…6a218d6c` |
| R3 realidad VPS | `reports/R3_vps_sync_reality.md` | `a75be185…a8dbaf5d` · 43.424 B (solo lectura) |
| R4 telemetría/players | `reports/R4_telemetry_matrix.md` | `92420ff0…3e0f8d85` · 55.594 B |
| R5 actuadores | `reports/R5_actuators.md` + `spec/actuator_allowlist.json` | `5af6f98d…2d87bdd` · gate 137/137 |
| R5 auditoría de catálogo | `reports/R5_policy_catalog.md` + `policy_findings*.json` | `8492f863…e3852c` · 10.631 canales 100 % clasificados |
| R6 seguridad | `reports/R6_security.md` | `9823c728…b79ab954` · 39.630 B |
| D1 contrato maestro | `spec/ARA_X_MASTER_CONTRACT.md` + `spec/ara_x_directives.json` | `719920ec…108b6eae` · `6aaffb6f…9c05f18` · D1 full 12/12 y `--no-inject` 10/10 |
| D2 política codec 4K/8K | `spec/ara_x_codec_policy.schema.json`, `ara_x_codec_cases.json`, `policy/policy_engine.js` | **1435 PASS · 0 FAIL** · 36 vectores + 300 sintéticos |
| D3 contrato `/sync` | `reports/D3_sync_contract.md`, `vps/schema/*.json`, `vps/client/ara_sync_client.js` | `c0693ecb…308f55f06`; drift gate «sin drift»; sync checker 43/43 |
| D4 aplicación device | `spec/ara_x_device_apply.md`, `device/apply_composer.js`, vectors | D4 120/120; tests device 32 (31 pass + 1 skip PHP) |
| D5 decisión ADC | `spec/ara_x_decision.md`, `controller/ara_x_decision_core.js`, vectors | 26/26 + 300/300; controller 26/26 |
| I1 núcleo de decisión | `controller/ara_x_decision_core.js` | tests 25/25 |
| I2 capa de lista | `playlist/ara_x_injector.js`, `ara_x_validator.js` | E2E real: 10.631 canales, 0 URL mutada, once=twice |
| I3 `/sync` staged | `vps/php/ara-sync.php`, `vps/lua/ara_x_sync.lua`, `vps/nginx/*` | PHP/Lua/nginx **staged**; sync tests 12/12, e2e 7/7, security 23/23, contract 37/37 |
| I3-LUA | `vps/lua/ara_x_sync.lua` + checker | checker **117/117**; lua tests 11/11; `luac -p` NOT_RUN |
| I4 compositor device | `device/apply_composer.js`, `device/README.md`, CLI | tests 32; fail-closed allowlist/SoC; `E_WIRE_8K` |
| I5 motor de política | `policy/policy_engine.js`, `reports/policy_findings*.json` | 100 % clasificado; 30 reglas; determinista |
| X1 integración opt-in | `integration/*` (hook, adapter, patch, baseline, verifies) | re-ejecutado: **23/23 + 37/37**, `git apply --check` exit 0, hot files unchanged |
| V1-R estática final | `reports/V1_validation.log` | `7816eda4…92e52ec6` · **18 PASS · 0 FAIL · 5 NOT_RUN** · auditorías 16/16 · suite 191/189/0/2 |
| V2 E2E listas A/B | `reports/V2_e2e_report.md` + `V2_e2e.json` | `87fafab2…41645f` · `1dd71d1b…2984377` · **2/2 listas, 78 checks, 0 fallos** |
| V3-R2 seguridad | `reports/V3_security.md` + reparaciones | `a1f40e0d…e3fc25b` · **PASS reparables de repo**; 106 archivos/0 findings |
| C1 council 10 dominios | (acta en el estado del equipo; no es archivo del ZIP) | **PASS repo/staged · PRODUCCIÓN NO-GO** |

Salidas E2E de las listas (NO empaquetadas; hashes en `EVIDENCE_MANIFEST.json`): 4K `APE_LISTA_4K_ARA-X_once/twice.m3u8` = 572.171.381 B · `c8b5039e…0d1ea07` ×2; CDN `…_full_ARA-X_once/twice.m3u8` = 568.242.361 B · `c32722c8…7a9a2dda` ×2. Entradas: 4K full 572.170.477 B · `e27c03eb…e2a680`; CDN full 568.241.457 B · `81dbdd11…95be14e`.

### 2.2 Staged — requiere ventana VPS o claim (no desplegado)

| Elemento | Estado | Gate para activarlo |
|---|---|---|
| `/sync` PHP + Lua + snippets nginx (`ara-x/vps/**`) | **staged**, no instalado en VPS | ventana + backup + `nginx -t` real + canary + rollback probado + F-01/F-05/F-09 cerrados |
| Bloque ARA-X en listas de producción | **no inyectado** en producción; solo en salidas E2E de `evidence/` (no servidas) | claim de I2/X1 + gate V2 + decisión de owner |
| Integración frontend X1 (`ara-x-hook.patch`, default OFF) | **no aplicada**; `git apply --check` OK | claim sobre `frontend/**` + tests del generador + revisión |
| F-01 (CRITICAL), F-05, F-09 | **NO-GO producción**; no arreglados | rotación del par en proveedor, CORS/cache/robots, store de claves por device, deny/allowlist VPS |
| Android APP (B), FRONTEND (C), LAB/Excel (D), `_vps_stage` (E) | sin build/tests/reverificación; **no commit** en X2 | ver `DEPLOY_PENDING_SINCE_25OCT.md` §2 |

### 2.3 Físicamente imposible (8K real en S905X4)

- **Decodificar/presentar 8K real en el S905X4 es físicamente imposible**: el decoder del SoC está limitado a 4K. La política ARA-X lo declara explícitamente: `MAX-DECODE-RESOLUTION:3840x2160`, `MAX-PRESENT-RESOLUTION:7680x4320` **solo presentación**, `8K-MODE:PRESENTATION`, y **0 `RESOLUTION=7680x4320` en el wire** (D1/D2/D4/C1).
- **No hay transcode en el VPS** (doctrina y R3): el VPS no puede convertir 4K→8K ni "mejorar píxeles"; el realce real es el VPP del device (AI-SR/AI-PQ). Declarar 8K real de decode sería la mentira que rompe el ONN 4K; por eso se prohíbe.
- **8K fake**: se detecta/clasifica (I5) y se rechaza en wire (`wire_8k_suppressed`, `E_WIRE_8K`); "8K" solo como presentación/display, nunca como stream decodificable. **PQ sobre SDR** es hint de display, no un bitstream HDR real.

### 2.4 NOT_RUN (declarado, nunca PASS)

| Comando | Motivo |
|---|---|
| `php -l` (2 archivos) | PHP no instalado local (ENOENT) |
| `luac -p` (1 archivo) | Lua/luac no instalados local (ENOENT) |
| `nginx -t` (3 fragmentos) | nginx no instalado local y los `.conf` son fragmentos que requieren el `nginx.conf` real (VPS, fuera de scope) |
| Deploy en VPS | **NO-GO** F-01/F-05/F-09; 0 escrituras al VPS por diseño |
| ADB / device (ONN 4K) | campaña repo-only; 0 ADB, 0 device |
| Build Android (B) | sin Gradle build ni APK |
| Tests de frontend (C) | sin suite de generador; X1 verifica su hook aislado |
| Re-verificación LAB/Excel (D) | libro 26/10 no reabierto |
| `node --test ara-x/tests/` (forma con directorio) | el runner de Node 24.12/Windows trata el directorio como módulo (0 tests); se usa el glob equivalente, verde |

---

## 3 · Verificación reproducible

```powershell
# 1) Integridad del paquete (Expand-Archive + manifiesto)
Expand-Archive -Path ara-x/deliverables/ARA_X_DELIVERY_20261030_222000.zip -DestinationPath .\x2_extract -Force
node .\x2_extract\ara-x\VERIFY_PACKAGE.js `
  --manifest .\x2_extract\ara-x\MANIFEST_SHA256.txt --root .\x2_extract
#   esperado: {"ok":true,"files_verified":120,"files_expected":120,"failures":[]} · exit 0
Get-FileHash ara-x/deliverables/ARA_X_DELIVERY_20261030_222000.zip -Algorithm SHA256
#   esperado: c014c46fe49e3bba31c506ae4a3543c232b1af0cfe63680414609061cdfc3362
Get-FileHash ara-x/deliverables/MANIFEST_SHA256.txt -Algorithm SHA256
#   esperado: f7f4481370c65316ae00054fccc01083066921f09c22219674cb74f3b9265a71

# 2) Gates estáticos/unitaros (V1-R) - exit 0
node ara-x/scripts/verify/run_static_checks.js
#   esperado: V1-R PASS · PASS=18 FAIL=0 NOT_RUN=5 · auditorías 16/16
node --test "ara-x/tests/*.test.js"
#   esperado: 191 tests · 189 pass · 0 fail · 2 skip · exit 0

# 3) E2E de las dos listas (≈12 min; reescribe solo evidence/ del scope V2)
node ara-x/scripts/e2e/run_e2e.js --list all
#   esperado: 2/2 listas PASS · 78 checks · once=twice (C8B5039E… / C32722C8…)

# 4) Integración X1 (staged)
node ara-x/integration/verify_integration.js   # 23/23
node ara-x/integration/verify_synthetic.js     # 37/37
git apply --check ara-x/integration/ara-x-hook.patch   # exit 0

# 5) Secretos (debe ser 0)
node ara-x/scripts/security/scan_secrets.js            # 106 archivos · 0 findings
node ara-x/scripts/security/scan_secrets.js --root <staging> --json   # 0 findings

# 6) Gates de contrato
node ara-x/scripts/d1_check_master_contract.js --no-inject
node ara-x/scripts/d2_check_codec_policy.js
node ara-x/scripts/d4_check_device_apply.js
node ara-x/scripts/r5_check_actuators.js
node ara-x/scripts/d5_check_decision.js
node ara-x/scripts/controller/run_decision_vectors.js
node ara-x/scripts/sync/check_sync_contract.js
node ara-x/scripts/lua/check_lua_module.js
node ara-x/scripts/gen_sync_schemas.js --check

# 7) Verificar la evidencia NO empaquetada (hashes)
#    comparar cada archivo de ara-x/evidence/ contra EVIDENCE_MANIFEST.json
Get-ChildItem ara-x/evidence -File | ForEach-Object {
  "{0}  {1}" -f $_.Name, (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
}

# 8) Reconstruir el paquete (manifiesto determinista con el mismo stamp)
pwsh -File ara-x/deliverables/build_package.ps1 -Stamp 20261030_222000
```

Resultados esperados: ZIP/manifiesto con los sha256 de §1; `VERIFY_PACKAGE` 120/120; V1-R 18/0/5 y auditorías 16/16; suite 191/189/0/2; E2E 2/2; X1 23+37; secretos 0.

---

## 4 · Rollback

- **Esta tarea no hizo commit, push ni deploy.** El estado de git queda igual: HEAD `083b07b` = `origin/feat/...`, **0 staged**.
- **Rollback del paquete:** borrar los archivos de `ara-x/deliverables/` (ZIP, manifiestos, JSON de build). No afecta al repo ni a la evidencia.
- **Reconstrucción:** `pwsh -File ara-x/deliverables/build_package.ps1 -Stamp <stamp>` (mismo payload ⇒ mismo manifiesto; el sha del ZIP puede variar por metadatos).
- **X1 staged:** el parche **no está aplicado**; si se aplicara, revertir con `git apply -R ara-x/integration/ara-x-hook.patch`.
- **VPS:** nada desplegado. Si en el futuro se usa el mapa activo, el propio pipeline tiene `rollback.sh <stamp> --yes` y backup en `/var/backups/ape-deploy/<stamp>/`; **nunca** se usa el mapa legacy.
- **Evidencia:** no se toca en X2. Si se corrompe, se regenera con `ara-x/scripts/e2e/run_e2e.js` (las capturas de entrada no están en el paquete; se referencian por hash).

---

## 5 · Preflight de commit/deploy (resumen; detalle en `DEPLOY_PENDING_SINCE_25OCT.md`)

- **Medido:** HEAD `083b07b` = `origin/feat/...` (ahead 0/behind 0) · **46 commits desde 2026-10-25** (el brief citaba 48; se documenta la diferencia, no se reescribe la historia) · **85 entradas de working tree** = **29 tracked (+1.876/−3.031)** + **56 untracked** (el brief: 85/29/±, coincide).
- **ARA-X ya está commiteado y pusheado:** `7fd1da6` (108 archivos) + `083b07b` (7 archivos) = 115 archivos trackeados; solo `ara-x/evidence/` queda untracked y **no se commitea** (10 archivos / 4,72 GB, par cuenta/clave en el path ⇒ V3-F-01).
- **Partición obligatoria:** (A) ARA-X verificado/commiteado/pusheado · (B) APP Android 8 tracked +474/−69 + 3 untracked, **sin build** · (C) FRONTEND 7 archivos, generador **+987**, agregado **+991/−2.842**, **sin tests** · (D) LAB/Excel 26/10 (`deliverables/LAB_2026-10-26/…xlsm` 3,4 MB) **sin reverificar** · (E) `_vps_stage` 3 tracked +72/−2 + 10 untracked, **sin `nginx -t`**, mapa activo `_vps_stage/deploy` (nunca legacy) · (F) basura/backups/docs **no se commitean** (`c:\tmplogcat_dump.txt` corrupto, `.mkv`, `_t16tmp`, `_incoming`, `_inbox*`, `_coord`, `verificacion`, `regen_multilist_report.json`, `_backups`, `deliverables/` raíz, etc.).
- **Regla:** commit **quirúrgico por grupo** con `git add <paths>` explícitos; **nunca** `git add -A`; no barrer los 29 tracked ajenos a `ara-x`; **push solo de rama y solo tras confirmación**.
- **Deploy:** **NO-GO** hasta cerrar **F-01/F-05/F-09** + ventana/backup/`nginx -t`/canary/rollback. **No se escribe en el VPS.**

---

## 6 · Secretos y credenciales

- **Paquete:** scanner de V3 sobre el staging ⇒ **117 archivos, 0 findings, exit 0** (`secret_scan_stage.json`); es el mismo scanner que audita la entrega (V3-R2).
- **Repo (incluye este reporte):** `secret_scan_repo.json` ⇒ **0 findings** (se ejecuta después de escribir este archivo).
- **Cero valores en el paquete/reporte:** solo hashes, tamaños, nombres de archivo y descripciones de forma ("par cuenta/clave en el path"), sin credenciales, claves, tokens, nonces ni query strings.
- **Evidencia cruda excluida:** `ara-x/evidence/**` no viaja en el ZIP precisamente porque las capturas contienen el par cuenta/clave del proveedor en el path (V3-F-01). La evidencia derivada `reports/r1_evidence/**` sí viaja, **redactada** (t26) y con 0 credenciales (V1-R §9.1).

---

## 7 · Evidencia enlazada (hashes de entrada y salida)

### 7.1 Entradas clave (incluidas en el ZIP)

| Archivo | Bytes | sha256 |
|---|---|---|
| `ara-x/spec/ARA_X_MASTER_CONTRACT.md` | 53.694 | `719920ec511efff1ab54086e087e9790da9ae2282ea10e7d8746d8bd108b6eae` |
| `ara-x/spec/ara_x_directives.json` | 17.577 | `6aaffb6f9a9725e194a3919da40b87b91e4e46dddb797cd2fd9d8f7fa9c05f18` |
| `ara-x/spec/4k8k_matrix.json` | 43.085 | `878054c6849222c41b84da3fa228f11222a9eca8721f370724cac94c6a218d6c` |
| `ara-x/spec/actuator_allowlist.json` | 54.971 | `c4670507012d71bbfddc0d04a3667edffeb6958707088ddf6596b2cd6c3b0df9` |
| `ara-x/reports/R1_list_forensics.md` | 40.336 | `305c8ee6e059a6f8e4701eaa9956152122f021ebf9ee6be93bd297cb7aa5fd24` |
| `ara-x/reports/R1_findings.json` | 27.102 | `55c9a6ea4302befaeebc218ef8bb1e782077de6402272e295c24307a39f95800` |
| `ara-x/reports/R2_codec_truth.md` | 33.087 | `193bf597393c87b9c07ee0fb8c2d6023f2f960e1bc721eab7435782f537b7cd8` |
| `ara-x/reports/R3_vps_sync_reality.md` | 43.424 | `a75be1858886e396d2267789508699b62e7b694bc7a844ca86edef72a8dbaf5d` |
| `ara-x/reports/R4_telemetry_matrix.md` | 55.594 | `92420ff000e96bc59df617bf615eef77a59e02fdcced5f8e8ef6739c3e0f8d85` |
| `ara-x/reports/R5_actuators.md` | 32.440 | `5af6f98d3eaf3f294f7875854aaa40cf195bc90706953c39b9fb572ca2d87bdd` |
| `ara-x/reports/R5_policy_catalog.md` | 10.389 | `8492f86384a7b1deb5168022b84db7c5a646cf77c1d32a64d0d589f713e3852c` |
| `ara-x/reports/R6_security.md` | 39.630 | `9823c7283014f096aff05ba4bcd31e9f19a904b2d6bf899d3b0bcec7b79ab954` |
| `ara-x/reports/D3_sync_contract.md` | 11.258 | `c0693ecb6952881c8557ef263ed6951e6b81c4eb2293cb63046a133308f55f06` |
| `ara-x/reports/T0_ownership_registration.md` | 8.753 | `3a7037f18e04311fd773b5ff01c747772461f112cc532de6ec9ae98863fcc8ef` |
| `ara-x/reports/V0_baseline_verification.md` | 5.697 | `154e6d87066cd922436ffd86b54c8151690fee767b700a20f7beb2efcedf3c84` |
| `ara-x/reports/V1_validation.log` | 69.896 | `7816eda469e58bbda8a5a2e98e0de5ffdece54da2761eb74d9f7398c92e52ec6` |
| `ara-x/reports/V2_e2e_report.md` | 19.028 | `87fafab298772c42ff20e54690e70086e0b85cf973e3a2348ce553e89e41645f` |
| `ara-x/reports/V2_e2e.json` | 43.305 | `1dd71d1bf28c18bf221c5e4ba49000f1fae3a8fe631a541d7e27171a02984377` |
| `ara-x/reports/V3_security.md` | 14.445 | `a1f40e0dcae82a5aa03dcae9e4591287006b51da29637ca9f03401a35e3fc25b` |
| `ara-x/reports/V3_repair_r2.md` | 10.385 | `94475e477c1ba3184a0aef0300273906f28da6127bb2c05053075cbe7ec15be0` |
| `ara-x/reports/V3_repair_t26.md` | 9.988 | `83a492a449f470d6276bf035873bf789ce1cf75f9b0824ae3dec7e0d2ee9f13f` |
| `ara-x/reports/V3_repair_t26_final.md` | 9.302 | `126326c8f90f1ea328207dac5953ae1840b6162ce2ebbc06d089acd0b321ab92` |
| `ara-x/integration/baseline.json` | 1.634 | `b999a1e617f330885e482085c3d86eaf71c08ac284e8f361fc11d6befe97a58c` |
| `ara-x/reports/DEPLOY_PENDING_SINCE_25OCT.md` | 8.625 | `89aca45cda3a527cbc0cd28c98c4cdb75ee8eedf02c4f01549dfe026c7ce1076` |

### 7.2 Evidencia NO empaquetada (listas A/B) — `EVIDENCE_MANIFEST.json`

| Archivo | Bytes | sha256 |
|---|---|---|
| `ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8` (input A) | 572.170.477 | `e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680` |
| `ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8` (input B) | 568.241.457 | `81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e` |
| `ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8` | 572.171.381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| `ara-x/evidence/APE_LISTA_4K_ARA-X_twice.m3u8` | 572.171.381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| `ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_once.m3u8` | 568.242.361 | `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda` |
| `ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_twice.m3u8` | 568.242.361 | `c32722c8afc33949df7edcd8a2ead0e0b7c1ebaa4ac57af58aacc4ae7a9a2dda` |
| `ara-x/evidence/APE_LISTA_4K_live_20261030_full_ARA-X_once.m3u8` (I2, list_version previo) | 572.171.381 | `24e1e3f6babb8c6df82a3de25616423d78aa608881407063ddcd277a4ddc951d` |
| `ara-x/evidence/APE_LISTA_4K_live_20261030_full_ARA-X_twice.m3u8` (I2) | 572.171.381 | `24e1e3f6babb8c6df82a3de25616423d78aa608881407063ddcd277a4ddc951d` |
| `ara-x/evidence/APE_LISTA_4K_live_20261030.m3u8` (captura menor) | 150.410.194 | `2f1a00aa5e36455e80253d0e7aa913fe906afade9dc366eeb5df28b0586c21e8` |
| `ara-x/evidence/T0_ownership_scopes_pre_edit.json` | 6.198 | `a5d3811a3fd66087480c7693e25772181a2aa4193618cc60e8141cbaae8e1a84` |

### 7.3 Salidas de esta tarea

Ver §1 (ZIP, manifiesto, evidencia, `MANIFEST.json`, `BUILD_SUMMARY.json`) y `ara-x/deliverables/DELIVERABLES_SHA256.txt` (hashes de todos los entregables, incluido este reporte, calculados después de escribirlo).

---

## 8 · Límites

- El paquete es un **snapshot** del árbol `ara-x/` en el momento del build (`2026-10-30T22:20 -05:00`), con hashes por archivo; no es un `git archive` (la evidencia untracked queda fuera, y el árbol puede cambiar después).
- El ZIP **no es byte-reproducible** entre builds (metadatos de `Compress-Archive`); el **manifiesto sí** es determinista para el mismo payload. La integridad se verifica por manifiesto + sha256 registrado.
- `X2_final_report.md` y `DEPLOY_PENDING_SINCE_25OCT.md` se entregan **fuera del ZIP** (este último también dentro); el ZIP cita su propio sha en `MANIFEST.json`.
- Sin red, sin VPS, sin deploy, sin commit/push, sin ADB/device. `php -l`/`luac -p`/`nginx -t` NOT_RUN por herramientas ausentes.
- La evidencia cruda (4,72 GB) no se empaqueta: incluye el par cuenta/clave del proveedor en el path (V3-F-01). Solo se entregan hashes y comandos de regeneración/verificación.
