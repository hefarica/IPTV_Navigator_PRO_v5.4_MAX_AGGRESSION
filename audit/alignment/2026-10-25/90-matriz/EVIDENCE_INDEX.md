# EVIDENCE_INDEX — cada afirmación → ruta y hash/línea (t9 / T8)

**Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`
**Generado por:** `audit/alignment/2026-10-25/90-matriz/tools/build_evidence_index.mjs` — los `sha256` de esta tabla
se **recalculan al generar el índice** (no se copian de los informes de t3..t8). La columna `re-hash` dice si el hash
coincide con el que la matriz usó al construir sus filas; un `DRIFT` ahí invalidaría la fila correspondiente.

## 0. Artefactos físicos medidos por t9 (la prueba primaria)

| Comprobación | Resultado | Ruta de evidencia | sha256 |
|---|---|---|---|
| Hash del `.xlsm` canónico | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · 3.582.019 B · mtime 2026-06-11T01:54:49-05:00 | `_raw/PHYS_syntax_and_hashes.txt` | `FD6FEA79D43FB4F7071C98C02C1D30CFB1167F1913B13A1F3BEA57495F463D2F` |
| Hashes de los 6 JSON de Downloads (B1/B2/B0/B3/CRYSTAL/export) | ver §1 y §2 | `_raw/PHYS_syntax_and_hashes.txt` | idem |
| `node --check` × 6 (generador) | 4/4 requeridos EXIT 0, stderr vacío (node v24.12.0) | `_raw/PHYS_syntax_and_hashes.txt` | idem |
| `php -l` × 7 (PHP portable 8.3.36, D-17) | **6/6 requeridos EXIT 0** + 1 copia extra también 0 | `_raw/PHYS_syntax_and_hashes.txt` | idem |
| Hash de la lista servida (A4) | `7F1CD8A7…CCC360` · 297.134.088 B · `gzip -t` OK · placeholder 8 B | `_raw/PHYS_rewrite_experiment.txt` | `FC2A5211592DC69A17CD13EBE11219AF2AA2C68206560DCA7B1062F6383E074D` |
| Diff manifest reescrito vs lista directa | ANTES `4A96480B…` (== disco) → DESPUÉS `87CAB2A2…`; 4 líneas cambiadas | `_raw/PHYS_rewrite_experiment.txt` | idem |
| Censo por perfil del catálogo servido | 14.343 `STREAM-INF`: P0 100 · P1 909 · **P2 0** · P3 13.167 · P4 38 · P5 129 | `_raw/PHYS_served_streaminf_by_profile.txt` | `FD2CD091C4408064490ACAE60582E7A4031FEDF74E969EBE63B6BAF5D3136721` |
| Comparación Excel ↔ JSON (9 campos × 6 perfiles) | `_raw/canon_vs_json.json` | `canon_vs_json.json` | `F8B82BEF70B15A1B5499616A919921C63C9F9BD05EF685A72B8E8414E2C06588` |
| Identidad del export canónico | `LAB_CALIBRATED_20260611_020645.json` **0 diffs/24**; `lab_master` 10/24 | `_raw/which_json_is_export.json` | `7639DCD046579802C29E544AAF38180BCD3F56227B27BC8A7201D66A63D18F69` |
| Gate de contratos + D-11 | `RESULT=FAIL (1/12)`; pin `9b774bff…` **== HEAD** (98.126 B) ≠ disco (99.666 B) | `_raw/PHYS_contracts_gate.txt` | `9E5EDD7D91C24D47B564A61BA61F26FC179B8D17531F30B197CFD84B21A42787` |

## 1. Artefactos SSOT (hashes calculados por t9 en esta sesión)

| Artefacto | bytes | sha256 | Re-hash ahora |
|---|---:|---|---|
| `C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm` <br><sub>Excel canónico (D-20)</sub> | 3582019 | 663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_20260611_020645.json` <br><sub>export FIEL del Excel (0 diffs/24)</sub> | 222364 | 6931BAF4BFA4C9EB0E565560220A2328DDBBF68E450B9E8307C6335E01382C93 | OK |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` <br><sub>JSON que la APP carga (10 diffs/24)</sub> | 280065 | 099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4 | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json` <br><sub>baseline B1 (bueno)</sub> | 408126 | FFD3E0E06129067CAD28E7DCD908C505A13E88F16C5B7B0089596C5172CA1DD7 | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json` <br><sub>baseline B2 (roto)</sub> | 408174 | 29C548050FFF3B3EBC0CD3ABE50CC64DDD2C5DF83687E233452A4A899B158865 | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-ALIGNED.json` <br><sub>baseline B0</sub> | 847417 | D2582BE76B7667564E7D1AF8B4C10E0DA01DE8DF70B9D3B473AF9E9C3830F367 | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json` <br><sub>baseline B3</sub> | 423609 | 279E45960550A15927658EF3E082DEB150E148DC0FB748DE1D3A51D47B56F017 | OK |
| `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` <br><sub>origen byte-idéntico de lab_master</sub> | 280065 | 099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4 | OK |

## 2. Entregables de las dependencias (t3/t4 Excel, t5 JSON, t6 APP, t7 VPS, t8 listas)

| # | Entregable | sha256 (recalculado) | Re-hash vs matriz |
|---:|---|---|---|
| 1 | `audit/alignment/2026-10-25/10-excel/EXCEL_INVENTORY.md` | `4CF8C9731F921E7B92E58EDA8CF654A0F29B140CDB535D7300A061FAC4989BDF` | OK |
| 2 | `audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json` | `D977BC999CB4A1A17AD48E42D6FC40761F9C4E210C1464EF18C54F4CD4769588` | OK |
| 3 | `audit/alignment/2026-10-25/20-json/JSON_INVENTORY.md` | `0680ABC3B22ACF31AFE8E00CC648980FFE4B602C247E7F14BDF524A8EF91943E` | OK |
| 4 | `audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json` | `FDD50FE6E15C3B9647361AF887E88CB61539321F2FC92DACE10651AB32E90376` | OK |
| 5 | `audit/alignment/2026-10-25/20-json/JSON_DRIFT_REPORT.md` | `36274703292D0579A9FC4C50C1AB7C4DF392A4ED3C539C1FDADD5D35E3E95C2F` | OK |
| 6 | `audit/alignment/2026-10-25/30-app/APP_INVENTORY.md` | `A929B79E227CD62CB9525C1A06F4F69DAD20251B78CC2048D62C5353F670D4EA` | OK |
| 7 | `audit/alignment/2026-10-25/30-app/APP_SYNTAX_CHECK.md` | `98973902E2FF72CBD5416F3E7823FC0C66A7EA146177DA8E482062E02A391B82` | OK |
| 8 | `audit/alignment/2026-10-25/30-app/APP_HARDCODE_FINDINGS.md` | `B902FA455BF5CAFAA61C6DC723E8AEE69C043033E71BFEC272422138C8B5FB07` | OK |
| 9 | `audit/alignment/2026-10-25/30-app/APP_SSOT_BINDINGS.md` | `CE0A68295875559EFA82C32494C504550883A8072665FA34014B17FF32C1FC89` | OK |
| 10 | `audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md` | `9DEF4C88DC692695E6E9E5AE981930F396481835CAC973C0A61128D06B32EE07` | OK |
| 11 | `audit/alignment/2026-10-25/30-app/PHP_LINT_GATE.md` | `2F14C1BEBBCDD91D4B4D8724DA4E054E87828A8B2294448729F7376B8C0BD756` | OK |
| 12 | `audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md` | `1207C3412FEC095DFE99D54D102E7285A24163F65334AAD62105D3AA22D622E7` | OK |
| 13 | `audit/alignment/2026-10-25/40-vps/VPS_NGINX_DUMP_ANALYSIS.md` | `9E19638A6A0D10540274293EFBA7E2C50E5A80941D7C6EE056186E234271D4EE` | OK |
| 14 | `audit/alignment/2026-10-25/40-vps/VPS_LUA_MODULES.md` | `748FFD71E21B575BA268C27167C195FDE5FFEEDC65FD0A14DAAB20B1A79D2D0B` | OK |
| 15 | `audit/alignment/2026-10-25/40-vps/VPS_LISTS_INVENTORY.md` | `113209F020BCD51E5AE7C3DAE151CB7B30C684D83DA5D837A10AF4174E16EB02` | OK |
| 16 | `audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md` | `355624549740CF296F479B51ABC6B6ACE691C3B6873F7DB2440712ED47DDA13F` | OK |
| 17 | `audit/alignment/2026-10-25/40-vps/VPS_READONLY_ATTESTATION.md` | `4117BC7385E967D4A005D9FA45FE256E15564D84BA6D059B8EDE4D5019D028E6` | OK |
| 18 | `audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf` | `0941B0F25B9F669F18F367D63FA8199A8D9B0D971FC71F9A11F5044E1E32B638` | OK |
| 19 | `audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md` | `6E792CB439DAE309D70189A8235D4686BDB6BEC3B2F5C7278ED95FABCE9CDBE4` | OK |
| 20 | `audit/alignment/2026-10-25/45-doctrina/DOCTRINE_VERSIONING_LOG.md` | `1135F2CAA17C307EAD8A69B29212E542DA9E74859AF2147E44EA1F456CE4E468` | OK |
| 21 | `audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md` | `CFB15981B20C3D03A3512BCA07AC5FBF27E663551E81B6679A9572B7396C36BE` | OK |
| 22 | `audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md` | `D1D7C41838DC07986BF0C0B5E033D9659BE2325DB8BB9D1316E3E3C4785DC593` | OK |
| 23 | `audit/alignment/2026-10-25/50-listas/LISTS_HEADERS_TRAPS.md` | `79FF7174CAE6A918F97E3CFAA69ACF7FBE6DFB0FEC6CB78F22B3373F783D51F4` | OK |
| 24 | `audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md` | `E7C6192D965DA04B999153FCC5C422B614A12A1345F73E00B88889F0583DF65A` | OK |
| 25 | `audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` | `C6F7BB1882F1E6DB7AB466D350887A934AF46E8424CEB7729F00C2600EDC2C3C` | OK |
| 26 | `audit/alignment/2026-10-25/50-listas/LISTS_SAMPLING.md` | `E0FA71BDA19C0A1792830863E827DFA11F56A17A3FDF1AB8031B85092EA50E01` | OK |
| 27 | `contracts/crystal_contracts.json` | `F6EDFE85C9619DDFD2CE1C2FF037577D1A7A90F34153935DB2E83FF56AFFDE29` | OK |

## 3. Afirmación → evidencia (las que sostienen el veredicto)

| Afirmación | Evidencia enlazada |
|---|---|
| El Excel canónico es la rama `Downloads` (`663EF44E…`, 55 hojas) | D-20 · `_raw/PHYS_syntax_and_hashes.txt` (hash re-medido) |
| El export del Excel coincide 24/24 con las celdas de `6_NIVEL_2_PROFILES` | `_raw/which_json_is_export.json` → `EXPORT_20260611_020645.totalDiffs = 0` |
| El JSON que la APP carga diverge en 10/24 celdas (P1 res/maxRes; P3 res+codec+maxRes; P4 res+codec+maxRes; P5 res+maxRes) | `_raw/which_json_is_export.json` → `lab_master_repo.profiles` |
| La APP carga `lab_master_22.6.0.json` por defecto | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-import-helper.js:36` (`DEFAULT_PATH`) |
| El fake-8K está ON por defecto (contra D-13) | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:10363-10364`, `:2500`, `:10377` |
| El emisor de variante de la APP | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:10393` (línea de `#EXT-X-STREAM-INF`) |
| El resolver PHP declara L153 con fps variable y `HDR=PQ` inválido | `backend/resolve_quality_unified.php:5514-5522` (`php -l` EXIT 0, sha256 `20AC4B26…`) |
| El resolver PHP inyecta un `STREAM-INF` huérfano en P0/P1 | `backend/resolve_quality_unified.php:4544` (+ su propio validador en `:856`, `:861`) |
| GOLDEN RULE rota en el generador PHP | `vps/ape_hls_generators.php:737-742` (`hev1.2.4.L153.B0` en `CODECS`) |
| `EXT-X-MAP` apunta a un `.m3u8` | `vps/ape_hls_generators.php:729` |
| 1.015/14.343 `STREAM-INF` del catálogo con nivel < resolución | `_raw/PHYS_served_streaminf_by_profile.txt` (suma 100+909+6) · `50-listas/LISTS_CODEC_COHERENCE.md` §1.1 (mismo número por otro método) |
| 23.510 `I-FRAME-STREAM-INF` y 0 con `URI=` | `_raw/PHYS_served_streaminf_by_profile.txt` (conteos) · `50-listas/LISTS_RFC8216_AUDIT.md` A-01 |
| `CAN-BLOCK-RELOAD=YES` sin implementación | cabecera del `.gz` línea 6 · `_vps_stage/lua/ape_rebase_lib.lua:76-87` · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §5.3 |
| El rewrite `/cdn/` infla `RESOLUTION` sin tocar `CODECS` | `_raw/PHYS_rewrite_experiment.txt` (diff físico) · `_vps_stage/lua/ape_uhd.lua:92-107` |
| `/lists/` es estático, sin Lua, byte-idéntico al `.gz` | `_raw/PHYS_rewrite_experiment.txt` · `40-vps/_raw/nginx-T.conf:706-763` · `50-listas/LISTS_INVENTORY.md` §1.4 |
| `/shield/` = 404 (D-33) | `_raw/PHYS_rewrite_experiment.txt` (`shield_status=404`) · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §1 |
| `/meta/` inalcanzable y su regex no admite `host:puerto` | `40-vps/_raw/nginx-T.conf:288` · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §5.4 |
| HEAD == VPS byte a byte (16/16) | `40-vps/VPS_DRIFT_VS_REPO.md` §1 (DR-02) |
| El rojo de contratos es `CONTRACT_DRIFT` (pin == HEAD) | `_raw/PHYS_contracts_gate.txt` (`9b774bff…` == blob de HEAD, 98.126 B) |
| Sintaxis JS/PHP limpia | `_raw/PHYS_syntax_and_hashes.txt` · `30-app/APP_SYNTAX_CHECK.md` · `30-app/PHP_LINT_GATE.md` |
| Ley 4 (NO-STRIP) 947,3 líneas/canal y 23.510 `#EXTHTTP` | `50-listas/LISTS_INVENTORY.md` §1.3 · conteos `_raw/PHYS_served_streaminf_by_profile.txt` |
| Ley 5 (SHIELDED) 0 `/shield/` y 0 `/cdn/` en el catálogo | conteos de t9 sobre el `.gz` · `50-listas/LISTS_INVENTORY.md` §1.2 (A5 ≡ A4) |
| La doctrina Crystal describe un VPS inexistente | `40-vps/VPS_DRIFT_VS_REPO.md` §4/§5 · `40-vps/DOCTRINE_CORRECTION.md` · `CLAUDE.md` «REALIDAD MEDIDA» |
| P2 no se emite en el catálogo servido | `_raw/PHYS_served_streaminf_by_profile.txt` (no hay fila `P2`) |

## 4. Índice de líneas de código citadas (verificadas con `grep` en esta sesión)

| Archivo | Línea(s) | Qué prueba |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | **10363-10364** | default del fake-8K = `8k` cuando `window.APE_FAKE_UHD` no está definido |
| idem | **2495-2500** | `fakeMode === 8k` ⇒ `rr = {7680,4320}` (override de resolución) |
| idem | **2581** | `pqAllowed = fakeActive ? true : …` (PQ incondicional bajo fake) |
| idem | **10377** | emite `#EXT-X-APE-UPSCALE:fake8k,…` |
| idem | **10393** | línea final de emisión del `#EXT-X-STREAM-INF` |
| idem | **9949** | `#EXT-X-I-FRAME-STREAM-INF` sin `URI` (por perfil de emisión) |
| `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` | **5514-5522** | `buildStreamInf()`: `L153` + `FRAME-RATE={$fps}` + `HDR=PQ` |
| idem | **4544** | `STREAM-INF` huérfano inyectado tras `#EXTM3U` en P0/P1 |
| idem | **856, 861** | validador propio del archivo que el huérfano rompe |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` | **737-742** | `hev1.*` dentro de `CODECS` de `STREAM-INF` (GOLDEN RULE rota) |
| idem | **729** | `EXT-X-MAP:URI="{providerM3u8}"` (init segment falso) |
| idem | **736** | `$fps = $cfg[fps] ?? 120` (default 120) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-import-helper.js` | **36** | `DEFAULT_PATH = lab_master_22.6.0.json` (entra el artefacto divergente) |
| `_vps_stage/lua/ape_uhd.lua` | **92-107** | `declare_auto`: sube `RESOLUTION` a 8K si la top ≥ 3840 |
| `_vps_stage/lua/ape_rebase_lib.lua` | **76-87** | `inject_server_control`: `CAN-BLOCK-RELOAD=YES` |
| `audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf` | **706-763** | `location ~* \.m3u8$` con `gzip_static`/`gunzip` y sin Lua |
| idem | **788** | `\.(ts|m4s|mp4)$ → 404` (el VPS no transporta vídeo) |
| idem | **288** | regex `ape_host` de `/meta/` (no admite `:`) |

## 5. Herramientas reproducibles dejadas por t9 (`90-matriz/tools/`)

| Script | Qué hace | Read-only |
|---|---|---|
| `extract_canon.mjs` | extrae celdas canónicas (Excel) y valores JSON por perfil a `_raw/canon_vs_json.json` | sí |
| `which_json_is_the_export.mjs` | compara res/fps/codec_full/maxResolution de los 6 perfiles contra 5 candidatos JSON e identifica el export fiel (0/24) y el divergente (10/24) | sí |
| `build_matrix.mjs` | genera `ALIGNMENT_MATRIX.md` + `ALIGNMENT_MATRIX.json` desde una sola fuente y **falla con exit 1** si el nº de filas o los estados difieren | sí |
| `build_evidence_index.mjs` | genera este índice recalculando cada sha256 | sí |

## 6. Atestación

- **Escrituras de t9:** únicamente `audit/alignment/2026-10-25/90-matriz/**` (5 entregables + 4 scripts + 5 artefactos `_raw/`).
- **Cero** escrituras en el VPS: todas las interacciones fueron `sha256sum`, `stat`, `gzip -t`, `zcat`, `grep`, `curl` GET y `diff`.
- **Cero** escrituras en el repo fuera de la lane; **cero** commits; **cero** ramas; **cero** `git add`.
- **Cero** fixes aplicados: B-01…B-16 quedan como propuesta con archivo:línea.

*Fin de `EVIDENCE_INDEX.md`.*
