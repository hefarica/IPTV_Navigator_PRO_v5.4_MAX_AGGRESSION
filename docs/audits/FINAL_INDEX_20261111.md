# INDICE FINAL DE ARTEFACTOS — canary-jit-20261111

**Fecha:** 2026-11-11 · **Autor:** canary-auditor (task `t29`) · **HEAD medido:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e`
**Que es:** la lista de **todo** lo que este equipo produjo, con ruta, bytes y `sha256` **medidos en esta corrida**, agrupado por tipo, para que una sesion futura lo verifique con un solo comando (§1).

**Recuento:** **48 artefactos** en **8 grupos** · `tracked` 10 · `untracked` (no ignorado) 31 · **`IGNORADO` por git 7**

> Aviso que manda sobre el resto: los **6 entregables** de `docs/canary/deliverables/` estan **IGNORADOS** por `.gitignore:173` (`deliverables/`). Existen en disco y **no viajan**. Medido en `docs/audits/DELIVERY_GAP_20261111.md`.

> **Este indice no se lista a si mismo.** Un `sha256` no puede contenerse: si el fichero incluyera su propio hash, ese hash seria falso en cuanto se escribiera. Su identidad se declara en el informe de cierre y se puede recomputar con `Get-FileHash docs/audits/FINAL_INDEX_20261111.md`.

---

## 1. Verificarlo todo en un comando

Desde la raiz del workspace (PowerShell 7). Compara **cada fila** de las tablas de §2 y §3 contra el disco: existencia, bytes y sha256. Los bytes van como entero plano (sin separador de miles) precisamente para que este comando funcione.

```powershell
$bad=0; $n=0; Get-Content docs/audits/FINAL_INDEX_20261111.md |
  Select-String '^\|\s*`([^`]+)`\s*\|\s*([0-9]+)\s*\|\s*`([0-9a-f]{64})`' |
  ForEach-Object { $n++; $m=$_.Matches[0]; $p=$m.Groups[1].Value; $b=[int64]$m.Groups[2].Value; $h=$m.Groups[3].Value;
    if(-not (Test-Path -LiteralPath $p)) { "FALTA   $p"; $bad++ }
    elseif((Get-Item -LiteralPath $p).Length -ne $b) { "BYTES   $p"; $bad++ }
    elseif((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() -ne $h) { "SHA256  $p"; $bad++ } }
"filas verificadas = $n"; "desviaciones = $bad"
```

Salida esperada: `desviaciones = 0`. Cualquier linea `FALTA`/`BYTES`/`SHA256` es un artefacto que cambio despues de este indice — y entonces este indice ya no vale para ese fichero.

---

## 2. Artefactos por grupo

### Entregables §16 (docs/canary/deliverables) — 7 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` | 1685154 | `70d6de7ca4ed83c8ccd0394f469acba55b92ba73f749bda346caa6495f4d0b8c` | IGNORADO |
| `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 1593602 | `c724300c2f496c5b19d80119173b06f9392d523ddbba77a3388ec592709dac8a` | IGNORADO |
| `docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch` | 865408 | `a2ebec163172362a5be912f901e183e68f131de534e0461ab6c2aefc28163f89` | IGNORADO |
| `docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md` | 25619 | `96eec6fd6a4969b68ad9e4bcaf80f6fc5ccbb0769ced16c17926008d5e26760c` | IGNORADO |
| `docs/canary/deliverables/10_CANARY_ANDROID_APK.md` | 16793 | `8dc07a601da3639dba204ec419dcfc523d6d13ff2a9dc9dfaf23dd99694bc4ea` | IGNORADO |
| `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` | 25760 | `3d22513b8a77be5fccee1d6faa2a5c57b9852b6c485ee17dddfc058bcca6c65a` | IGNORADO |
| `docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json` | 10672 | `f43eb9e25d09dca3a31f1152f0e5a13ea257809d7326760943451d6a3427570a` | IGNORADO |

### Contratos (contracts/*canary*) — 3 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 35791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` | untracked |
| `contracts/canary_policy_schema.json` | 8672 | `bc9ed9fc94fa793f02061831161f0f3126c44a4179e1a2a3c7a671d4de727f8f` | untracked |
| `contracts/canary_vps_reconciler_contract.json` | 15558 | `761d621558e7742b631de861a3ec7e64665fb74d2ec325e033b7903328ded8b0` | untracked |

### Herramientas (tools/canary) — 3 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `tools/canary/deploy_contract_check.js` | 17325 | `7b873ea169be4e6bba630edcbc17164c78665a159aeec989baa32362358a727c` | untracked |
| `tools/canary/md_to_pdf.js` | 22390 | `d9e3242ff22848e36b09a9fad2b40321d792e61f28fb3ed4479ab2d5cb914001` | untracked |
| `tools/canary/playlist_adapter.js` | 41462 | `31020f0c1f9994bb59fb4f02da4558db42d5a04b52378f38eece4b2f3552eace` | untracked |

### Herramientas (tools/quality, canary/schemas/playlist) — 3 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `tools/quality/test_canary_jit_contract.js` | 71957 | `0869149200cc0e7290e7de112fd0aa81914726435fd67989b34f29628169680b` | untracked |
| `tools/quality/test_playlist_adapter.js` | 30784 | `8b5b313c335a08a01e6d08330620720c80d67caeaf67fc0336d77d553ab9efa4` | untracked |
| `tools/quality/test_schemas.js` | 31680 | `80005638565356163b57dd573ff7a2c2edac011ead9ab7f76ee0c69fa76d31a1` | untracked |

### Informes y auditorias (docs/audits, .md) — 24 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `docs/audits/14_CANARY_FINAL_REPORT.md` | 32324 | `79c3f8513964463c5c58dd2386a0cea6d667ace335548c76ad05a622156c8916` | untracked |
| `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31615 | `8a62e7203a558c86e43996475db4ff117ba84eb6a38d4b64ae6d1020a287faae` | untracked |
| `docs/audits/APK_FEASIBILITY_20261111.md` | 20028 | `84ee21a5b758d874c56d7bf2b9652a2bfc8e7f5e8b099d7a11d7424778746407` | untracked |
| `docs/audits/APK_SECRET_SCAN_20261111.md` | 20987 | `f1ebcee7392cccf468388c9cd8cf951904a4652b15d4ae1c119540b56333c527` | untracked |
| `docs/audits/APK654_OTTSHIM_20261108.md` | 10176 | `2c32be29e878ee025d3c7c6bb800a61300f9f44da23132f39fc16c3ff2745a3a` | tracked |
| `docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md` | 57739 | `faf8a9dbd87367660b38ec8f2527e6cfd98cb83d5ea5c2815ed6a5904c8947b0` | tracked |
| `docs/audits/CANARY_TRUTH_20261111.md` | 47639 | `33c214ef2360039f6da675344f1aac4b96e96b645eba46a79510e5f5abd98da6` | untracked |
| `docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md` | 10994 | `97232e4fdc77e1a9b3b8b4c37ab1cb6f14c2ff3790677e00c5944087f5dd1087` | tracked |
| `docs/audits/CONTRACT_REVIEW_20261111.md` | 26393 | `8e3a214130c77cc2f81e993432ac0a8c683e885acfb2dfdc6f075dec6909772c` | untracked |
| `docs/audits/CONTRACT_REVIEW_ROUND2_20261111.md` | 19552 | `9d3c9256d859949e3880b42b302c1626eb318601f4465d34f6caec7841bc8eaf` | untracked |
| `docs/audits/CONTRACT_REVIEW_ROUND3_20261111.md` | 13898 | `1affc1728b67ecb2fb22522485107307e1398a33209b65f08bab357cf0dcfe59` | untracked |
| `docs/audits/DELIVERABLES_03_12_20261111.md` | 11760 | `ffcda874ceae3e8b85634137d3a9dc6d71dcb72fe0729eee838422d1465fb497` | untracked |
| `docs/audits/DELIVERY_GAP_20261111.md` | 11727 | `fd7cbe599733a845e268f0a5cd8dde07b90b1a82cd0c69cbfc909e8faf51e231` | untracked |
| `docs/audits/DEPLOY_RECONCILER_20261111.md` | 15139 | `ae8633437a63362f86e35cf1fafaa3d4edf110554898a29ac37bc894da6cbe88` | untracked |
| `docs/audits/INFORME_FINAL_VERIFICACION_20261108.md` | 14970 | `b922733b043623dca4efcf9655d3b8e5649845ddfa0c2c55965cdf38ca2bdfed` | tracked |
| `docs/audits/JIT_HTTP_PROBES_20261111.md` | 26540 | `f1c2510582a9f1547ba785da3fdfecf475c39a061ce069524ee1ca85e7210c13` | untracked |
| `docs/audits/JIT_TRUTH_20261111.md` | 52730 | `e9e864b211f4d8e6fb19ecb3841f653b61c6257458003f12c7834aa0fbf8b1f4` | untracked |
| `docs/audits/PDF_GENERATION_20261111.md` | 12816 | `43c0dba97c6cd8cec03c83b3b8c07861efd5063b450b2c8b9b64aab4c1ca6f0c` | untracked |
| `docs/audits/PLAYLIST_ADAPTER_20261111.md` | 19628 | `b643a4ab0c3d10802706f43a3520fcee152d9b7ac049cc2569b0557320a97964` | untracked |
| `docs/audits/PRUEBA_FISICA_REA_654_20261108.md` | 220727 | `7faf54b24785f3bd36a976015ce1ad67679e5dc227424ac3b50146e894b0e5b8` | tracked |
| `docs/audits/REA_ALIGNMENT_20261108.md` | 16935 | `8a23bd9f71bfe5963367d45713015a08ac38241f4023c485abccd3d57d253647` | tracked |
| `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md` | 14065 | `d0d5e2cea68773451f478892a6a2634a153004e6ea9b06fbce3cb1b784c7d002` | untracked |
| `docs/audits/SCHEMAS_20261111.md` | 29057 | `36ce40700f73479471d40c470ee12b2f285bf050c0e095a7b1bda936d22a49c9` | untracked |
| `docs/audits/VEREDICTO_CANARY_JIT_20261111.md` | 44013 | `3b9f155041a5c03558dc078421e5c0d0285e62173f883c488275d207b520c0b0` | untracked |

### Matrices y datos (docs/audits, .json) — 6 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `docs/audits/ACCEPTANCE_MATRIX_20261111.json` | 32284 | `5e201693a2aa2b7574d221626b2f5010c67b968a57f8e0c7b8d6e9bc0be73f77` | untracked |
| `docs/audits/alignment_report_20261108.json` | 5729 | `fffacd3937dba44aa41f52eba2ecaeea9f9f24a6dc5c49cc40e3672854f86aea` | tracked |
| `docs/audits/REA_ALIGNMENT_BASELINE_20261107.json` | 2965 | `02ca943b06dc58ccc3685a9017b934b3b4059c8e43e59e4fcae673deb6d29de3` | tracked |
| `docs/audits/REA_APK_653_VERIFICATION.json` | 7772 | `80bfb26de21e2cd9f807aae03deaca83627e06c979dfd392ff6c1a6d2d25b3f5` | tracked |
| `docs/audits/REA_VALIDATION_20261108.json` | 39563 | `dbc60123cba5e2c732e5413e828577ff1e588c62d4fefa6808db23bc44e51d6c` | tracked |
| `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.json` | 13238 | `7c55de7afb5e377210d59afca9ec3c89e8a7b68ecb4d23be211bcea3b9aba94e` | untracked |

### Manifiestos (docs/manifestos, CANARY) — 1 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32264 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` | untracked |

### Politicas (docs/policies) — 1 ficheros

| Ruta | Bytes | SHA-256 | git |
|---|---|---|---|
| `docs/policies/SECRETS_IN_BINARIES.md` | 19394 | `8b783a8e936005be0e2aeb2131ece8f87e474604df689d6b4e8733ab8fa41311` | untracked |

---

## 3. Los 14 entregables del §16, en una linea cada uno

| # | Estado | Ruta medida | Bytes | SHA-256 |
|---|---|---|---|---|
| 1 | canonical | `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` | 1685154 | `70d6de7ca4ed83c8ccd0394f469acba55b92ba73f749bda346caa6495f4d0b8c` |
| 2 | canonical | `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 1593602 | `c724300c2f496c5b19d80119173b06f9392d523ddbba77a3388ec592709dac8a` |
| 3 | canonical | `docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch` | 865408 | `a2ebec163172362a5be912f901e183e68f131de534e0461ab6c2aefc28163f89` |
| 4 | canonical | `contracts/canary_policy_schema.json` | 8672 | `bc9ed9fc94fa793f02061831161f0f3126c44a4179e1a2a3c7a671d4de727f8f` |
| 5 | canonical | `contracts/device_capability_schema.json` | 18840 | `8ea89f8564a8b8b8da2b77808ef0113f68b37d9ae36ccbae4d130e84a24d3605` |
| 6 | canonical | `tools/canary/playlist_adapter.js` | 41462 | `31020f0c1f9994bb59fb4f02da4558db42d5a04b52378f38eece4b2f3552eace` |
| 7 | renamed | `docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md` | 25619 | `96eec6fd6a4969b68ad9e4bcaf80f6fc5ccbb0769ced16c17926008d5e26760c` |
| 8 | partial | `vps/bin/ape-pulse-canary-worker.sh` | 4043 | `a17281d6cf865b37f869924124af04c9296827565709c64ceaedd84db5ac282e` |
| 9 | canonical | `contracts/canary_vps_reconciler_contract.json` | 15558 | `761d621558e7742b631de861a3ec7e64665fb74d2ec325e033b7903328ded8b0` |
| 10 | canonical | `docs/canary/deliverables/10_CANARY_ANDROID_APK.md` | 16793 | `8dc07a601da3639dba204ec419dcfc523d6d13ff2a9dc9dfaf23dd99694bc4ea` |
| 11 | canonical | `docs/audits/ACCEPTANCE_MATRIX_20261111.json` | 32284 | `5e201693a2aa2b7574d221626b2f5010c67b968a57f8e0c7b8d6e9bc0be73f77` |
| 12 | canonical | `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` | 25760 | `3d22513b8a77be5fccee1d6faa2a5c57b9852b6c485ee17dddfc058bcca6c65a` |
| 13 | canonical | `_vps_stage/deploy/rollback.sh` | 1782 | `3aff6df8b5cd2e9d2935e4dff2f9580659469b2788c39743ce0aa4d42c4c0eb4` |
| 14 | canonical | `docs/audits/14_CANARY_FINAL_REPORT.md` | 32324 | `79c3f8513964463c5c58dd2386a0cea6d667ace335548c76ad05a622156c8916` |

Detalle, discrepancias y hallazgos: `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md`.

---

## 4. Que NO esta en este indice, y por que

| Cosa | Razon |
|---|---|
| Binarios `.apk`, PDF fuente, ZIP, videos | No son artefactos de texto del equipo; el APK tiene su propio manifiesto (`docs/canary/deliverables/10_CANARY_ANDROID_APK.md`) con puntero + hash, y **no se copia** |
| `.agent-teams/`, `.agents/`, `_inbox_*` | Estado del harness y material heredado, no producido por este equipo |
| Ficheros de `scratch/` | Insumos de trabajo del operador (ignorados por `.gitignore`); sus hashes viven en los informes que los citan |
| Artefactos del VPS | No hay acceso al VPS en esta sesion: todo lo del servidor es **NO_COMPUTADO** y esta declarado en cada informe |
| `docs/audits/FINAL_INDEX_20261111.md` | Es este fichero: un hash no puede contenerse (§ aviso) |

---

## 5. Lo que este indice NO afirma

1. **No dice que los entregables sean correctos.** Dice donde estan y cual es su hash. Lo que esta roto o a medias se declara en `S16_DELIVERABLES_INVENTORY_20261111.md` §5 (§5.1 registro sin autenticar, §5.3 esquema frente a emisor).
2. **No dice que hayan viajado.** 7 de 48 estan **ignorados por git**. Un indice puede estar completo y el transporte vacio: eso es exactamente lo que pasa aqui.
3. **No sella el futuro.** Un `sha256` mide el instante. Con un APK no determinista o un documento que se reescribe, el hash identifica **esta** version, no el concepto (ya paso con 07 y con el APK).
