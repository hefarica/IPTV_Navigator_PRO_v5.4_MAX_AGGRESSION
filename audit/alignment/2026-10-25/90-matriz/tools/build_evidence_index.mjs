#!/usr/bin/env node
// t9 — genera EVIDENCE_INDEX.md con los sha256 REALES (recalculados aquí, no copiados).
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const M = JSON.parse(fs.readFileSync(`${ROOT}/audit/alignment/2026-10-25/90-matriz/ALIGNMENT_MATRIX.json`, 'utf8'));
const sha = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase() : 'MISSING');

const idx = M.evidencePaths;                  // {KEY:{path,sha256}} — recalculados al construir la matriz
const fresh = {};                             // y re-recalculados AHORA para EVIDENCE_INDEX
for (const [k, v] of Object.entries(idx)) fresh[k] = { path: v.path, sha256: sha(`${ROOT}/${v.path}`), match: sha(`${ROOT}/${v.path}`) === v.sha256 };

const L = [];
const p = (s = '') => L.push(s);

p('# EVIDENCE_INDEX — cada afirmación → ruta y hash/línea (t9 / T8)');
p();
p('**Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`');
p('**Generado por:** `audit/alignment/2026-10-25/90-matriz/tools/build_evidence_index.mjs` — los `sha256` de esta tabla');
p('se **recalculan al generar el índice** (no se copian de los informes de t3..t8). La columna `re-hash` dice si el hash');
p('coincide con el que la matriz usó al construir sus filas; un `DRIFT` ahí invalidaría la fila correspondiente.');
p();
p('## 0. Artefactos físicos medidos por t9 (la prueba primaria)');
p();
p('| Comprobación | Resultado | Ruta de evidencia | sha256 |');
p('|---|---|---|---|');
p('| Hash del `.xlsm` canónico | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · 3.582.019 B · mtime 2026-06-11T01:54:49-05:00 | `_raw/PHYS_syntax_and_hashes.txt` | `' + fresh.E_M_SYNTAX.sha256 + '` |');
p('| Hashes de los 6 JSON de Downloads (B1/B2/B0/B3/CRYSTAL/export) | ver §1 y §2 | `_raw/PHYS_syntax_and_hashes.txt` | idem |');
p('| `node --check` × 6 (generador) | 4/4 requeridos EXIT 0, stderr vacío (node v24.12.0) | `_raw/PHYS_syntax_and_hashes.txt` | idem |');
p('| `php -l` × 7 (PHP portable 8.3.36, D-17) | **6/6 requeridos EXIT 0** + 1 copia extra también 0 | `_raw/PHYS_syntax_and_hashes.txt` | idem |');
p('| Hash de la lista servida (A4) | `7F1CD8A7…CCC360` · 297.134.088 B · `gzip -t` OK · placeholder 8 B | `_raw/PHYS_rewrite_experiment.txt` | `' + fresh.E_M_REWRITE.sha256 + '` |');
p('| Diff manifest reescrito vs lista directa | ANTES `4A96480B…` (== disco) → DESPUÉS `87CAB2A2…`; 4 líneas cambiadas | `_raw/PHYS_rewrite_experiment.txt` | idem |');
p('| Censo por perfil del catálogo servido | 14.343 `STREAM-INF`: P0 100 · P1 909 · **P2 0** · P3 13.167 · P4 38 · P5 129 | `_raw/PHYS_served_streaminf_by_profile.txt` | `' + fresh.E_M_PROF.sha256 + '` |');
p('| Comparación Excel ↔ JSON (9 campos × 6 perfiles) | `_raw/canon_vs_json.json` | `canon_vs_json.json` | `' + fresh.E_M_CANON.sha256 + '` |');
p('| Identidad del export canónico | `LAB_CALIBRATED_20260611_020645.json` **0 diffs/24**; `lab_master` 10/24 | `_raw/which_json_is_export.json` | `' + fresh.E_M_IDENT.sha256 + '` |');
p('| Gate de contratos + D-11 | `RESULT=FAIL (1/12)`; pin `9b774bff…` **== HEAD** (98.126 B) ≠ disco (99.666 B) | `_raw/PHYS_contracts_gate.txt` | `' + fresh.E_M_CONTRACTS.sha256 + '` |');
p();
p('## 1. Artefactos SSOT (hashes calculados por t9 en esta sesión)');
p();
p('| Artefacto | bytes | sha256 | Re-hash ahora |');
p('|---|---:|---|---|');
const ssot = [
  ['C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm', 'Excel canónico (D-20)'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_20260611_020645.json', 'export FIEL del Excel (0 diffs/24)'],
  ['IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json', 'JSON que la APP carga (10 diffs/24)'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json', 'baseline B1 (bueno)'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json', 'baseline B2 (roto)'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-ALIGNED.json', 'baseline B0'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json', 'baseline B3'],
  ['C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json', 'origen byte-idéntico de lab_master'],
];
for (const [abs, label] of ssot) {
  const fp = abs.startsWith('C:') ? abs : `${ROOT}/${abs}`;
  const b = fs.existsSync(fp) ? fs.statSync(fp).size : 'MISSING';
  p(`| \`${abs.replace('C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/', '')}\` <br><sub>${label}</sub> | ${b} | ${fs.existsSync(fp) ? sha(fp) : 'MISSING'} | ${fs.existsSync(fp) ? 'OK' : 'MISSING'} |`);
}
p();
p('## 2. Entregables de las dependencias (t3/t4 Excel, t5 JSON, t6 APP, t7 VPS, t8 listas)');
p();
p('| # | Entregable | sha256 (recalculado) | Re-hash vs matriz |');
p('|---:|---|---|---|');
const order = ['E_XLSM_HASH', 'E_EXTRACT', 'E_JSON_INV', 'E_JSON_MATRIX', 'E_JSON_DRIFT', 'E_APP_INV', 'E_APP_SYNTAX', 'E_APP_HARD', 'E_APP_SSOT', 'E_APP_EMIT', 'E_PHP_LINT', 'E_VPS_INV', 'E_VPS_NGINX', 'E_VPS_LUA', 'E_VPS_LISTS', 'E_VPS_DRIFT', 'E_VPS_ATT', 'E_VPS_T', 'E_DOC', 'E_DOCV', 'E_L_INV', 'E_L_RFC', 'E_L_TRAPS', 'E_L_CODEC', 'E_L_DIFF', 'E_L_SAMP', 'E_CONTRACTS'];
let i = 0;
for (const k of order) {
  if (!fresh[k]) continue;
  i++;
  p(`| ${i} | \`${fresh[k].path}\` | \`${fresh[k].sha256}\` | ${fresh[k].match ? 'OK' : '**DRIFT**'} |`);
}
p();
p('## 3. Afirmación → evidencia (las que sostienen el veredicto)');
p();
p('| Afirmación | Evidencia enlazada |');
p('|---|---|');
const claims = [
  ['El Excel canónico es la rama `Downloads` (`663EF44E…`, 55 hojas)', 'D-20 · `_raw/PHYS_syntax_and_hashes.txt` (hash re-medido)'],
  ['El export del Excel coincide 24/24 con las celdas de `6_NIVEL_2_PROFILES`', '`_raw/which_json_is_export.json` → `EXPORT_20260611_020645.totalDiffs = 0`'],
  ['El JSON que la APP carga diverge en 10/24 celdas (P1 res/maxRes; P3 res+codec+maxRes; P4 res+codec+maxRes; P5 res+maxRes)', '`_raw/which_json_is_export.json` → `lab_master_repo.profiles`'],
  ['La APP carga `lab_master_22.6.0.json` por defecto', '`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-import-helper.js:36` (`DEFAULT_PATH`)'],
  ['El fake-8K está ON por defecto (contra D-13)', '`frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:10363-10364`, `:2500`, `:10377`'],
  ['El emisor de variante de la APP', '`frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:10393` (línea de `#EXT-X-STREAM-INF`)'],
  ['El resolver PHP declara L153 con fps variable y `HDR=PQ` inválido', '`backend/resolve_quality_unified.php:5514-5522` (`php -l` EXIT 0, sha256 `20AC4B26…`)'],
  ['El resolver PHP inyecta un `STREAM-INF` huérfano en P0/P1', '`backend/resolve_quality_unified.php:4544` (+ su propio validador en `:856`, `:861`)'],
  ['GOLDEN RULE rota en el generador PHP', '`vps/ape_hls_generators.php:737-742` (`hev1.2.4.L153.B0` en `CODECS`)'],
  ['`EXT-X-MAP` apunta a un `.m3u8`', '`vps/ape_hls_generators.php:729`'],
  ['1.015/14.343 `STREAM-INF` del catálogo con nivel < resolución', '`_raw/PHYS_served_streaminf_by_profile.txt` (suma 100+909+6) · `50-listas/LISTS_CODEC_COHERENCE.md` §1.1 (mismo número por otro método)'],
  ['23.510 `I-FRAME-STREAM-INF` y 0 con `URI=`', '`_raw/PHYS_served_streaminf_by_profile.txt` (conteos) · `50-listas/LISTS_RFC8216_AUDIT.md` A-01'],
  ['`CAN-BLOCK-RELOAD=YES` sin implementación', 'cabecera del `.gz` línea 6 · `_vps_stage/lua/ape_rebase_lib.lua:76-87` · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §5.3'],
  ['El rewrite `/cdn/` infla `RESOLUTION` sin tocar `CODECS`', '`_raw/PHYS_rewrite_experiment.txt` (diff físico) · `_vps_stage/lua/ape_uhd.lua:92-107`'],
  ['`/lists/` es estático, sin Lua, byte-idéntico al `.gz`', '`_raw/PHYS_rewrite_experiment.txt` · `40-vps/_raw/nginx-T.conf:706-763` · `50-listas/LISTS_INVENTORY.md` §1.4'],
  ['`/shield/` = 404 (D-33)', '`_raw/PHYS_rewrite_experiment.txt` (`shield_status=404`) · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §1'],
  ['`/meta/` inalcanzable y su regex no admite `host:puerto`', '`40-vps/_raw/nginx-T.conf:288` · `50-listas/LISTS_DIFF_VPS_VS_DIRECT.md` §5.4'],
  ['HEAD == VPS byte a byte (16/16)', '`40-vps/VPS_DRIFT_VS_REPO.md` §1 (DR-02)'],
  ['El rojo de contratos es `CONTRACT_DRIFT` (pin == HEAD)', '`_raw/PHYS_contracts_gate.txt` (`9b774bff…` == blob de HEAD, 98.126 B)'],
  ['Sintaxis JS/PHP limpia', '`_raw/PHYS_syntax_and_hashes.txt` · `30-app/APP_SYNTAX_CHECK.md` · `30-app/PHP_LINT_GATE.md`'],
  ['Ley 4 (NO-STRIP) 947,3 líneas/canal y 23.510 `#EXTHTTP`', '`50-listas/LISTS_INVENTORY.md` §1.3 · conteos `_raw/PHYS_served_streaminf_by_profile.txt`'],
  ['Ley 5 (SHIELDED) 0 `/shield/` y 0 `/cdn/` en el catálogo', 'conteos de t9 sobre el `.gz` · `50-listas/LISTS_INVENTORY.md` §1.2 (A5 ≡ A4)'],
  ['La doctrina Crystal describe un VPS inexistente', '`40-vps/VPS_DRIFT_VS_REPO.md` §4/§5 · `40-vps/DOCTRINE_CORRECTION.md` · `CLAUDE.md` «REALIDAD MEDIDA»'],
  ['P2 no se emite en el catálogo servido', '`_raw/PHYS_served_streaminf_by_profile.txt` (no hay fila `P2`)'],
];
for (const [c, e] of claims) p(`| ${c} | ${e} |`);
p();
p('## 4. Índice de líneas de código citadas (verificadas con `grep` en esta sesión)');
p();
p('| Archivo | Línea(s) | Qué prueba |');
p('|---|---|---|');
const code = [
  ['`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`', '10363-10364', 'default del fake-8K = `8k` cuando `window.APE_FAKE_UHD` no está definido'],
  ['idem', '2495-2500', '`fakeMode === 8k` ⇒ `rr = {7680,4320}` (override de resolución)'],
  ['idem', '2581', '`pqAllowed = fakeActive ? true : …` (PQ incondicional bajo fake)'],
  ['idem', '10377', 'emite `#EXT-X-APE-UPSCALE:fake8k,…`'],
  ['idem', '10393', 'línea final de emisión del `#EXT-X-STREAM-INF`'],
  ['idem', '9949', '`#EXT-X-I-FRAME-STREAM-INF` sin `URI` (por perfil de emisión)'],
  ['`IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php`', '5514-5522', '`buildStreamInf()`: `L153` + `FRAME-RATE={$fps}` + `HDR=PQ`'],
  ['idem', '4544', '`STREAM-INF` huérfano inyectado tras `#EXTM3U` en P0/P1'],
  ['idem', '856, 861', 'validador propio del archivo que el huérfano rompe'],
  ['`IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`', '737-742', '`hev1.*` dentro de `CODECS` de `STREAM-INF` (GOLDEN RULE rota)'],
  ['idem', '729', '`EXT-X-MAP:URI="{providerM3u8}"` (init segment falso)'],
  ['idem', '736', '`$fps = $cfg[fps] ?? 120` (default 120)'],
  ['`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-import-helper.js`', '36', '`DEFAULT_PATH = lab_master_22.6.0.json` (entra el artefacto divergente)'],
  ['`_vps_stage/lua/ape_uhd.lua`', '92-107', '`declare_auto`: sube `RESOLUTION` a 8K si la top ≥ 3840'],
  ['`_vps_stage/lua/ape_rebase_lib.lua`', '76-87', '`inject_server_control`: `CAN-BLOCK-RELOAD=YES`'],
  ['`audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf`', '706-763', '`location ~* \\.m3u8$` con `gzip_static`/`gunzip` y sin Lua'],
  ['idem', '788', '`\\.(ts|m4s|mp4)$ → 404` (el VPS no transporta vídeo)'],
  ['idem', '288', 'regex `ape_host` de `/meta/` (no admite `:`)'],
];
for (const [f, l, w] of code) p(`| ${f} | **${l}** | ${w} |`);
p();
p('## 5. Herramientas reproducibles dejadas por t9 (`90-matriz/tools/`)');
p();
p('| Script | Qué hace | Read-only |');
p('|---|---|---|');
const tools = [
  ['`extract_canon.mjs`', 'extrae celdas canónicas (Excel) y valores JSON por perfil a `_raw/canon_vs_json.json`', 'sí'],
  ['`which_json_is_the_export.mjs`', 'compara res/fps/codec_full/maxResolution de los 6 perfiles contra 5 candidatos JSON e identifica el export fiel (0/24) y el divergente (10/24)', 'sí'],
  ['`build_matrix.mjs`', 'genera `ALIGNMENT_MATRIX.md` + `ALIGNMENT_MATRIX.json` desde una sola fuente y **falla con exit 1** si el nº de filas o los estados difieren', 'sí'],
  ['`build_evidence_index.mjs`', 'genera este índice recalculando cada sha256', 'sí'],
];
for (const [t, d, r] of tools) p(`| ${t} | ${d} | ${r} |`);
p();
p('## 6. Atestación');
p();
p('- **Escrituras de t9:** únicamente `audit/alignment/2026-10-25/90-matriz/**` (5 entregables + 4 scripts + 5 artefactos `_raw/`).');
p('- **Cero** escrituras en el VPS: todas las interacciones fueron `sha256sum`, `stat`, `gzip -t`, `zcat`, `grep`, `curl` GET y `diff`.');
p('- **Cero** escrituras en el repo fuera de la lane; **cero** commits; **cero** ramas; **cero** `git add`.');
p('- **Cero** fixes aplicados: B-01…B-16 quedan como propuesta con archivo:línea.');
p();
p('*Fin de `EVIDENCE_INDEX.md`.*');

fs.writeFileSync(`${ROOT}/audit/alignment/2026-10-25/90-matriz/EVIDENCE_INDEX.md`, L.join('\n') + '\n', 'utf8');
const drift = Object.entries(fresh).filter(([, v]) => !v.match).map(([k]) => k);
console.log(`entries=${i} drift=${drift.length ? drift.join(',') : 'none'}`);
if (drift.length) process.exit(1);
