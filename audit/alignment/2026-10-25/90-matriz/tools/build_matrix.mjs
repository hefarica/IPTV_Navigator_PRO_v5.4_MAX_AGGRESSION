#!/usr/bin/env node
/**
 * t9 / T8 — Constructor de la MATRIZ DE ALINEACIÓN capa↔capa.
 * Emite ALIGNMENT_MATRIX.md y ALIGNMENT_MATRIX.json desde UNA sola fuente de datos,
 * y FALLA (exit 1) si el nº de filas o los estados no coinciden entre ambos.
 *
 * Read-only sobre producción: sólo lee archivos ya producidos por t3..t8 + los artefactos
 * físicos que este verificador midió (ver _raw/).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const OUT = `${ROOT}/audit/alignment/2026-10-25/90-matriz`;
const sha = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase() : 'MISSING');

// ── Evidencia: rutas + sha256 calculados AHORA (no heredados) ────────────────
const EV = {
  E_EXTRACT: 'audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json',
  E_XLSM_HASH: 'audit/alignment/2026-10-25/10-excel/EXCEL_INVENTORY.md',
  E_JSON_INV: 'audit/alignment/2026-10-25/20-json/JSON_INVENTORY.md',
  E_JSON_MATRIX: 'audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json',
  E_JSON_DRIFT: 'audit/alignment/2026-10-25/20-json/JSON_DRIFT_REPORT.md',
  E_APP_INV: 'audit/alignment/2026-10-25/30-app/APP_INVENTORY.md',
  E_APP_SYNTAX: 'audit/alignment/2026-10-25/30-app/APP_SYNTAX_CHECK.md',
  E_APP_HARD: 'audit/alignment/2026-10-25/30-app/APP_HARDCODE_FINDINGS.md',
  E_APP_SSOT: 'audit/alignment/2026-10-25/30-app/APP_SSOT_BINDINGS.md',
  E_APP_EMIT: 'audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md',
  E_PHP_LINT: 'audit/alignment/2026-10-25/30-app/PHP_LINT_GATE.md',
  E_VPS_INV: 'audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md',
  E_VPS_NGINX: 'audit/alignment/2026-10-25/40-vps/VPS_NGINX_DUMP_ANALYSIS.md',
  E_VPS_LUA: 'audit/alignment/2026-10-25/40-vps/VPS_LUA_MODULES.md',
  E_VPS_LISTS: 'audit/alignment/2026-10-25/40-vps/VPS_LISTS_INVENTORY.md',
  E_VPS_DRIFT: 'audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md',
  E_VPS_ATT: 'audit/alignment/2026-10-25/40-vps/VPS_READONLY_ATTESTATION.md',
  E_VPS_T: 'audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf',
  E_DOC: 'audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md',
  E_DOCV: 'audit/alignment/2026-10-25/45-doctrina/DOCTRINE_VERSIONING_LOG.md',
  E_L_INV: 'audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md',
  E_L_RFC: 'audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md',
  E_L_TRAPS: 'audit/alignment/2026-10-25/50-listas/LISTS_HEADERS_TRAPS.md',
  E_L_CODEC: 'audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md',
  E_L_DIFF: 'audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md',
  E_L_SAMP: 'audit/alignment/2026-10-25/50-listas/LISTS_SAMPLING.md',
  E_M_CANON: 'audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json',
  E_M_IDENT: 'audit/alignment/2026-10-25/90-matriz/_raw/which_json_is_export.json',
  E_M_REWRITE: 'audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt',
  E_M_PROF: 'audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt',
  E_M_SYNTAX: 'audit/alignment/2026-10-25/90-matriz/_raw/PHYS_syntax_and_hashes.txt',
  E_CONTRACTS: 'contracts/crystal_contracts.json',
  E_M_CONTRACTS: 'audit/alignment/2026-10-25/90-matriz/_raw/PHYS_contracts_gate.txt',
};

const H = {};
for (const [k, rel] of Object.entries(EV)) H[k] = { path: rel, sha256: sha(path.join(ROOT, rel)) };

// helper de cita: <archivo> sha256:<12 hex>
const cite = (k, extra = '') => `${EV[k]}${extra ? ' ' + extra : ''} · sha256:${H[k].sha256.slice(0, 12)}…`;

// ── Filas ────────────────────────────────────────────────────────────────────
const R = [];
const row = (o) => R.push(o);

/* ===== E1 · Excel → JSON ==================================================== */
const E1_BASE = 'Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663)';

row({ id: 'E1-P0', edge: 'Excel→JSON', profile: 'P0', family: '—',
  expected: 'res=B25 "7680x4320" · fps=B32 120 · codec_full=B37 "dvh1.08.06" · maxRes=B48 "7680x4320"',
  expectedEv: `${E1_BASE} · celdas citadas vía ${cite('E_EXTRACT')}`,
  observed: 'settings.resolution=7680x4320 · fps=120 · codec_full=dvh1.08.06 · maxResolution=7680x4320 (0 diffs/4 campos) → el artefacto del repo copia fielmente la hoja',
  observedEv: `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json · sha256:099A1707…371FD4 · ${cite('E_M_CANON')}`,
  status: 'PASS', impact: 'NONE',
  note: 'La fidelidad es PASS; el VALOR es defectuoso (fps=120 sobre DV level 6.0) → se evalúa en la ley L11/D-35, no en esta arista (D-36).' });

row({ id: 'E1-P1', edge: 'Excel→JSON', profile: 'P1', family: '—',
  expected: 'res=C25 "3840x2160" · fps=C32 120 · codec_full=C37 "hvc1.2.4.L153.B0" · maxRes=C48 "3840x2160" (D-22/D-34)',
  expectedEv: `${E1_BASE} · ${cite('E_EXTRACT')}`,
  observed: 'resolution=7680x4320 (≠) · maxResolution=7680x4320 (≠) · codec_full=hvc1.2.4.L153.B0 (=) · fps=120 (=) → 2 diffs/4. Además headerOverrides.X-APE-RESOLUTION[0]="7680x4320…" y vlcopt video-width=7680/video-height=4320 (≠ C136/C109/C110)',
  observedEv: `lab_master_22.6.0.json sha256:099A1707…371FD4 · ${cite('E_M_CANON')} · ${cite('E_JSON_MATRIX', '§P1.laws.L10_EXCEL_CANONICAL_MATCH (6 diffs)')}`,
  status: 'FAIL', impact: 'LAW:L1+L3 · CHAIN_BREAK',
  note: 'Híbrido corrupto: resolución de la hoja 37_VALORES_UNIFICADOS (8K) + codec de 6_NIVEL_2_PROFILES (L153 4K@60) = el patrón del freeze 2026-06-08.' });

row({ id: 'E1-P2', edge: 'Excel→JSON', profile: 'P2', family: '—',
  expected: 'res=D25 "3840x2160" · fps=D32 120 · codec_full=D37 "hvc1.2.4.L150.B0" · maxRes=D48 "3840x2160"',
  expectedEv: `${E1_BASE} · ${cite('E_EXTRACT')}`,
  observed: 'resolution=3840x2160 · fps=120 · codec_full=hvc1.2.4.L150.B0 · maxResolution=3840x2160 → 0 diffs/4',
  observedEv: `lab_master_22.6.0.json · ${cite('E_M_CANON')}`,
  status: 'PASS', impact: 'NONE',
  note: 'Fidelidad PASS. Nota: P2 es el único perfil cuyo códec NO degrada el JSON (L150 en hoja y en JSON).' });

row({ id: 'E1-P3', edge: 'Excel→JSON', profile: 'P3', family: '—',
  expected: 'res=E25 "1920x1080" · fps=E32 120 · codec_full=E37 "hvc1.2.4.L123.B0" (Main10) · maxRes=E48 "1920x1080" (D-37)',
  expectedEv: `${E1_BASE} · ${cite('E_EXTRACT')}`,
  observed: 'resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=hvc1.1.6.L120.B0 (≠, degradado a Main 8-bit) → 3 diffs/4',
  observedEv: `lab_master_22.6.0.json · ${cite('E_M_CANON')} · ${cite('E_JSON_DRIFT')}`,
  status: 'FAIL', impact: 'LAW:L1+L4+L3 · CHAIN_BREAK',
  note: 'Doble rotura: resolución inflada a 4K y piso Main10 roto (hvc1.1.* = Main 8-bit).' });

row({ id: 'E1-P4', edge: 'Excel→JSON', profile: 'P4', family: '—',
  expected: 'res=F25 "1280x720" · fps=F32 120 · codec_full=F37 "hvc1.2.4.L93.B0" (Main10) · maxRes=F48 "1280x720" (D-37)',
  expectedEv: `${E1_BASE} · ${cite('E_EXTRACT')}`,
  observed: 'resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=avc1.64001f (≠, AVC/Baseline-ish en vez de Main10) → 3 diffs/4',
  observedEv: `lab_master_22.6.0.json · ${cite('E_M_CANON')} · ${cite('E_JSON_DRIFT')}`,
  status: 'FAIL', impact: 'LAW:L1+L4+L3 · CHAIN_BREAK',
  note: 'Degradación a AVC de un perfil que la hoja define Main10 L93.' });

row({ id: 'E1-P5', edge: 'Excel→JSON', profile: 'P5', family: '—',
  expected: 'res=G25 "854x480" · fps=G32 120 · codec_full=G37 "avc1.42c01e" · maxRes=G48 "854x480"',
  expectedEv: `${E1_BASE} · ${cite('E_EXTRACT')}`,
  observed: 'resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=avc1.42c01e (=) → 2 diffs/4',
  observedEv: `lab_master_22.6.0.json · ${cite('E_M_CANON')}`,
  status: 'FAIL', impact: 'LAW:L1+L3 · CHAIN_BREAK',
  note: 'El perfil failsafe SD declara 4K: el player que caiga a P5 pedirá una resolución que el nivel AVC 3.0 no sostiene.' });

row({ id: 'E1-EXPORT', edge: 'Excel→JSON', profile: 'P0–P5', family: '—',
  expected: 'El exportador (mod_PRISMA_Export.bas) debe escribir las celdas de 6_NIVEL_2_PROFILES sin alterarlas',
  expectedEv: `${E1_BASE}`,
  observed: 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_20260611_020645.json (222.364 B, sha256:6931BAF4…) → **0 diffs / 24 comparaciones** (res, fps, codec_full, maxResolution × 6 perfiles) ⇒ el exportador es FIEL',
  observedEv: `${cite('E_M_IDENT')} · ${cite('E_JSON_INV')}`,
  status: 'PASS', impact: 'NONE',
  note: 'HALLAZGO t9: el eslabón Excel→JSON está SANO en el escritor. El artefacto divergente es lab_master_22.6.0.json (= CRYSTAL-4K-UHD, 10 diffs/24), que es justo el que la APP carga por defecto (ape-lab-import-helper.js:36 DEFAULT_PATH="lab_master_22.6.0.json").' });

/* ===== E2 · JSON → APP ====================================================== */
const APP_FAKE = 'm3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF)';

row({ id: 'E2-P0', edge: 'JSON→APP', profile: 'P0', family: '—',
  expected: 'JSON P0: RESOLUTION=7680x4320 · CODECS=dvh1.08.06 · FRAME-RATE=120 (settings.*)',
  expectedEv: `${cite('E_APP_EMIT', '§3 tabla SSOT + §4')}`,
  observed: 'APP rama D emite RESOLUTION=7680x4320 (coincide por el fake-8K, no por binding) · CODECS=hvc1.2.4.L183.B0 (≠ dvh1) · FRAME-RATE=60.000 (clamp ≠ 120) · BANDWIDTH=200.000.000 (≠ bandwidth_max 80.000.000)',
  observedEv: `${APP_FAKE} · ape-hevc-cascade.js resolveTierByResolution · ${cite('E_APP_EMIT', '§4 P0 + §6')}`,
  status: 'FAIL', impact: 'LAW:L2+L3',
  note: 'El códec DV del SSOT nunca llega a la lista: la cascada CSV (V2) manda sobre codec_full (V1).' });

row({ id: 'E2-P1', edge: 'JSON→APP', profile: 'P1', family: '—',
  expected: 'JSON P1: RESOLUTION=7680x4320 · CODECS=hvc1.2.4.L153.B0 · FRAME-RATE=120',
  expectedEv: `${cite('E_APP_EMIT', '§3/§4')}`,
  observed: 'RESOLUTION=7680x4320 (=) · CODECS=hvc1.2.4.L183.B0 (≠ L153) · FRAME-RATE=60.000 (≠ 120)',
  observedEv: `${APP_FAKE} · ${cite('E_APP_EMIT', '§4 P1')}`,
  status: 'FAIL', impact: 'LAW:L2+L3',
  note: 'La APP "corrige" el nivel por su cuenta (L153→L183); es un override no declarado del SSOT.' });

row({ id: 'E2-P2', edge: 'JSON→APP', profile: 'P2', family: '—',
  expected: 'JSON P2: RESOLUTION=3840x2160 · CODECS=hvc1.2.4.L150.B0 · FRAME-RATE=120',
  expectedEv: `${cite('E_APP_EMIT', '§3/§4')}`,
  observed: 'RESOLUTION=7680x4320 (≠, forzado por fakeMode) · CODECS=hvc1.2.4.L183.B0 (≠ L150) · FRAME-RATE=60.000 (≠)',
  observedEv: `${APP_FAKE} · ${cite('E_APP_EMIT', '§4 P2 + §6 recuadro')}`,
  status: 'FAIL', impact: 'LAW:L2+L1',
  note: 'F-APP-04: override TOTAL de la resolución. Es el mecanismo por el que el SSOT deja de mandar.' });

row({ id: 'E2-P3', edge: 'JSON→APP', profile: 'P3', family: '—',
  expected: 'JSON P3: RESOLUTION=3840x2160 · CODECS=hvc1.1.6.L120.B0 · FRAME-RATE=120 · video_range=SDR',
  expectedEv: `${cite('E_APP_EMIT', '§3/§4')}`,
  observed: 'RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (familia ≠: AVC) · FRAME-RATE=60.000 (≠) · VIDEO-RANGE=PQ (SSOT dice SDR)',
  observedEv: `${APP_FAKE} · :10236-10238 (avc1.640029→64003E) · ${cite('E_APP_EMIT', '§4 P3')}`,
  status: 'FAIL', impact: 'LAW:L2+L3',
  note: 'AVC declarado sobre RESOLUTION 8K: dos capas de mentira al player (familia y resolución).' });

row({ id: 'E2-P4', edge: 'JSON→APP', profile: 'P4', family: '—',
  expected: 'JSON P4: RESOLUTION=3840x2160 · CODECS=avc1.64001f · FRAME-RATE=120',
  expectedEv: `${cite('E_APP_EMIT', '§3/§4')}`,
  observed: 'RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (≠ 64001f) · FRAME-RATE=60.000 (≠)',
  observedEv: `${APP_FAKE} · ${cite('E_APP_EMIT', '§4 P4')}`,
  status: 'FAIL', impact: 'LAW:L2+L3', note: 'Mismo patrón.' });

row({ id: 'E2-P5', edge: 'JSON→APP', profile: 'P5', family: '—',
  expected: 'JSON P5: RESOLUTION=3840x2160 · CODECS=avc1.42c01e · FRAME-RATE=120',
  expectedEv: `${cite('E_APP_EMIT', '§3/§4')}`,
  observed: 'RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (≠ 42c01e) · FRAME-RATE=60.000 (≠)',
  observedEv: `${APP_FAKE} · ${cite('E_APP_EMIT', '§4 P5')}`,
  status: 'FAIL', impact: 'LAW:L2+L3',
  note: 'El perfil failsafe deja de ser failsafe: declara 8K con AVC High.' });

row({ id: 'E2-RESOLVER', edge: 'JSON→APP', profile: 'P0/P1 (ct=sports)', family: '—',
  expected: 'El resolver PHP debe declarar el nivel que soporte la resolución+fps (Ley L1)',
  expectedEv: 'Manifiesto OMEGA Ley 1 + D-15',
  observed: 'resolve_quality_unified.php:5519-5520 emite RESOLUTION=3840x2160, FRAME-RATE={fps}.000, CODECS="hvc1.2.4.L153.B0,mp4a.40.2" con fps=120 para ct=sports ⇒ L153 (4K@60) declarando 4K@120 = imposible. Añade además HDR=PQ, atributo inexistente en RFC 8216, y AUDIO/SUBTITLES con GROUP-ID inexistente',
  observedEv: `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:5514-5522 · sha256:20AC4B26…C5F2B5 · ${cite('E_APP_EMIT', '§7')}`,
  status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'F-APP-01: la aplicación PHP replica el freeze 2026-06-08 por diseño (fps=120 fijo con nivel 5.1).' });

/* ===== E3 · APP → listas ==================================================== */
row({ id: 'E3-P0', edge: 'APP→listas', profile: 'P0', family: 'A (servida)', 
  expected: 'APP declara P0 = RESOLUTION 7680x4320 + CODECS hvc1.2.4.L183.B0 (contrato §4). El catálogo debe llevar al menos una variante P0 coherente',
  expectedEv: `${cite('E_APP_EMIT', '§4 P0')}`,
  observed: 'En APE_LISTA_1792869328847.m3u8.gz hay 100 STREAM-INF con STABLE-VARIANT-ID="*_P0": 96× 3840x2160@60 + L120, 4× 3840x2160@30 + L123. CERO variantes 8K y CERO dvh1',
  observedEv: `${cite('E_M_PROF', '(censo t9: 14.343 STREAM-INF agrupados por perfil)')} · ${cite('E_L_CODEC', '§1.1')}`,
  status: 'FAIL', impact: 'LAW:L1+L3 · CHAIN_BREAK',
  note: '100/100 variantes P0 son IMPOSIBLES: L120/L123 (techo 1080p) declarando 3840x2160.' });

row({ id: 'E3-P1', edge: 'APP→listas', profile: 'P1', family: 'A (servida)',
  expected: 'APP declara P1 = 7680x4320 + L183; el SSOT canónico dice 3840x2160 + L153',
  expectedEv: `${cite('E_APP_EMIT', '§4 P1')} · ${cite('E_EXTRACT', 'C25/C37')}`,
  observed: '909 STREAM-INF "*_P1": 737× 3840x2160@30 + hvc1.2.4.L123.B0, 172× 3840x2160@60 + hvc1.2.4.L120.B0. Ni 8K, ni L183, ni L153',
  observedEv: `${cite('E_M_PROF')} · muestra física: línea 35.279 del .gz descomprimido · ${cite('E_L_CODEC', '§1.1 (cita STABLE-VARIANT-ID="47_P1")')}`,
  status: 'FAIL', impact: 'LAW:L1+L3 · CHAIN_BREAK',
  note: 'Es la violación insignia: 4K declarado con nivel 1080p. Suma con P0 las 1.015 líneas imposibles que t8 midió (coincide exacto).' });

row({ id: 'E3-P2', edge: 'APP→listas', profile: 'P2', family: 'A (servida)',
  expected: 'APP declara P2 = 7680x4320 + L183; SSOT 3840x2160 + L150',
  expectedEv: `${cite('E_APP_EMIT', '§4 P2')}`,
  observed: '0 STREAM-INF con STABLE-VARIANT-ID "*_P2" en los 14.343 del catálogo servido',
  observedEv: `${cite('E_M_PROF', '(no aparece la fila P2)')}`,
  status: 'UNKNOWN', impact: 'CHAIN_BREAK?',
  note: 'UNKNOWN con motivo: el perfil P2 no se emite en el catálogo servido, así que no hay observación que comparar contra el contrato. No se puede declarar PASS ni FAIL de emisión.' });

row({ id: 'E3-P3', edge: 'APP→listas', profile: 'P3', family: 'A (servida)',
  expected: 'APP declara P3 = 7680x4320 + avc1.64003E (fake) ; SSOT 3840x2160 + hvc1.1.6.L120',
  expectedEv: `${cite('E_APP_EMIT', '§4 P3')} · ${cite('E_EXTRACT', 'E25/E37')}`,
  observed: '13.167 STREAM-INF "*_P3": 9.638× 1920x1080@30 + L150 (coherente), 3.523× 1920x1080@60 + L123 (coherente), 6× 3840x2160@60 + L120 (imposible). Cero AVC',
  observedEv: `${cite('E_M_PROF')}`,
  status: 'FAIL', impact: 'LAW:L3+L1',
  note: 'El 99,95 % de las líneas P3 son coherentes en nivel, pero NO coinciden con lo que el contrato de la APP dice que emite (8K/AVC) ni con el SSOT (4K/Main10). Ley de coherencia triple rota.' });

row({ id: 'E3-P4', edge: 'APP→listas', profile: 'P4', family: 'A (servida)',
  expected: 'P4 canónico = 1280x720 + hvc1.2.4.L93.B0 (Excel F25/F37)',
  expectedEv: `${cite('E_EXTRACT', 'F25/F37')}`,
  observed: '38 STREAM-INF "*_P4": 26× 1920x1080@30+L150, 12× 1920x1080@60+L123. Se declara 1080p para el perfil "HD 720p"',
  observedEv: `${cite('E_M_PROF')}`,
  status: 'FAIL', impact: 'LAW:L3',
  note: 'El bucket de perfil deja de identificar la resolución calibrada; el nivel es coherente con lo declarado (1080p) pero el perfil miente sobre sí mismo.' });

row({ id: 'E3-P5', edge: 'APP→listas', profile: 'P5', family: 'A (servida)',
  expected: 'P5 canónico = 854x480 + avc1.42c01e (Excel G25/G37)',
  expectedEv: `${cite('E_EXTRACT', 'G25/G37')}`,
  observed: '129 STREAM-INF "*_P5": 34× 1920x1080@30+L150, 95× 1920x1080@60+L123',
  observedEv: `${cite('E_M_PROF')}`,
  status: 'FAIL', impact: 'LAW:L3',
  note: 'El failsafe SD4 declara 1080p HEVC en vez de 480p AVC: se pierde el propósito anti-freeze del perfil.' });

row({ id: 'E3-FAM-A', edge: 'APP→listas', profile: 'todos', family: 'A (5 listas directas + 2 CDN = 116.816 canales)',
  expected: 'GOLDEN RULE (hvc1 sólo en STREAM-INF, hev1 sólo en tags de player) + Ley L1 + 0 headers tóxicos',
  expectedEv: 'Manifiesto OMEGA Ley 1/4 · CLAUDE.md «GOLDEN RULE»',
  observed: 'GOLDEN RULE PASS (0 hev1 en STREAM-INF de 14.343; hev1 sólo en #EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1) · 0 headers tóxicos en 6 listas medidas · audio en CODECS 14.343/14.343 · PERO 1.015/14.343 STREAM-INF violan L1',
  observedEv: `${cite('E_L_CODEC', '§1.1/§1.2/§1.5')} · ${cite('E_L_TRAPS', '§3')}`,
  status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'La familia servida cumple GOLDEN RULE y anti-tóxicos; falla nivel↔resolución.' });

row({ id: 'E3-FAM-B', edge: 'APP→listas', profile: 'todos', family: 'B (22 contenidos del repo)',
  expected: 'GOLDEN RULE + Ley L1 + 0 tóxicos + 0 SUPPLEMENTAL-CODECS inventado',
  expectedEv: 'Manifiesto OMEGA Leyes 1/4 · CLAUDE.md «Lo que NUNCA se hace»',
  observed: 'hev1.1.6.L153.B0 dentro de CODECS de STREAM-INF en 1.359/1.359 canales (temp_analysis/…(17).m3u8:19) · 6/6 tóxicos en 3 listas idénticas · SUPPLEMENTAL-CODECS="lcev.1"/"lcev.1.1" en 192 líneas · 1.552 canales con nivel insuficiente en 4 archivos',
  observedEv: `${cite('E_L_CODEC', '§2.1-§2.4')} · ${cite('E_L_RFC', 'B-01/B-02/B-03/B-04')}`,
  status: 'FAIL', impact: 'LAW:L1+L5(GOLDEN) · CHAIN_BREAK',
  note: 'La familia B es histórico versionado, no se sirve; sigue siendo material del que cualquiera puede partir.' });

/* ===== E4 · listas → VPS-served ============================================= */
const SERVED = 'APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico)';

row({ id: 'E4-P0', edge: 'listas→VPS-served', profile: 'P0', family: 'A (directa/SHIELDED)',
  expected: 'El artefacto servido debe ser byte-idéntico al .gz publicado (sin Lua en /lists/, gzip_static+gunzip)',
  expectedEv: `${cite('E_VPS_T', ':706-763 (location ~* \\.m3u8$ con gzip_static always; gunzip on)')} · ${cite('E_L_INV', '§1.1')}`,
  observed: '100 líneas P0 del catálogo llegan al player sin alteración: sha256 del cuerpo servido == sha256 del .gz en disco (verificado por t9 con curl al vhost + sha256sum en el VPS). Cero headers X-APE-* en la respuesta',
  observedEv: `${SERVED} · ${cite('E_M_REWRITE')} · ${cite('E_L_INV', '§1.4')}`,
  status: 'PASS', impact: 'NONE',
  note: 'Identidad byte a byte. El defecto de P0 no lo introduce el VPS, viene de la lista (E3-P0).' });

row({ id: 'E4-P1', edge: 'listas→VPS-served', profile: 'P1', family: 'A (directa/SHIELDED)',
  expected: 'idem (identidad de bytes)', expectedEv: `${cite('E_L_INV', '§1.4')}`,
  observed: '909 líneas P1 servidas sin alteración; sha256 cuerpo servido == .gz',
  observedEv: `${SERVED} · ${cite('E_M_REWRITE')}`,
  status: 'PASS', impact: 'NONE', note: 'La violación L1 de P1 nace en la lista, no en la capa de servicio.' });

row({ id: 'E4-P2', edge: 'listas→VPS-served', profile: 'P2', family: 'A (directa/SHIELDED)',
  expected: 'idem', expectedEv: `${cite('E_L_INV', '§1.4')}`,
  observed: '0 líneas P2 en el artefacto servido: no hay nada que comparar',
  observedEv: `${SERVED} · ${cite('E_M_PROF')}`,
  status: 'UNKNOWN', impact: 'CHAIN_BREAK?',
  note: 'UNKNOWN con motivo: ausencia de P2 en el catálogo impide verificar la preservación de ese perfil en esta arista.' });

row({ id: 'E4-P3', edge: 'listas→VPS-served', profile: 'P3', family: 'A (directa/SHIELDED)',
  expected: 'idem', expectedEv: `${cite('E_L_INV', '§1.4')}`,
  observed: '13.167 líneas P3 servidas sin alteración; identidad de bytes confirmada',
  observedEv: `${SERVED} · ${cite('E_M_REWRITE')}`, status: 'PASS', impact: 'NONE', note: '—' });

row({ id: 'E4-P4', edge: 'listas→VPS-served', profile: 'P4', family: 'A (directa/SHIELDED)',
  expected: 'idem', expectedEv: `${cite('E_L_INV', '§1.4')}`,
  observed: '38 líneas P4 servidas sin alteración', observedEv: `${SERVED} · ${cite('E_M_PROF')}`,
  status: 'PASS', impact: 'NONE', note: '—' });

row({ id: 'E4-P5', edge: 'listas→VPS-served', profile: 'P5', family: 'A (directa/SHIELDED)',
  expected: 'idem', expectedEv: `${cite('E_L_INV', '§1.4')}`,
  observed: '129 líneas P5 servidas sin alteración', observedEv: `${SERVED} · ${cite('E_M_PROF')}`,
  status: 'PASS', impact: 'NONE', note: '—' });

row({ id: 'E4-M1', edge: 'listas→VPS-served', profile: '—', family: 'A plain + A SHIELDED (7 listas, 1,53 GiB)',
  expected: 'Servir el .gz descomprimido, sin intervención Lua, extensiones de caché y sin servir backups',
  expectedEv: `${cite('E_VPS_T', ':706-763 y :788 (:ts|m4s|mp4 → 404)')}`,
  observed: 'GET /lists/APE_LISTA_1792869328847.m3u8 → 200, Content-Type application/vnd.apple.mpegurl, Transfer-Encoding chunked, CERO X-APE-*; 7/7 gzip -t OK; los .bak no matchean la location',
  observedEv: `${cite('E_L_INV', '§1.4/§1.5')} · ${cite('E_M_REWRITE')}`,
  status: 'PASS', impact: 'NONE', note: 'El "rewrite del VPS" NO toca el catálogo (corrige la premisa del tablero).' });

row({ id: 'E4-M2', edge: 'listas→VPS-served', profile: '—', family: 'A CDN (`/cdn/`) — 2 listas, 21.040 canales',
  expected: 'El rewrite puede rebasar URIs y añadir tags propios, pero NO puede alterar RESOLUTION sin alterar CODECS (Ley L1)',
  expectedEv: 'Manifiesto OMEGA Ley 1 + D-15 · ape_uhd.lua:92-107 (declare_auto)',
  observed: 'Diff físico de t9 sobre el fixture permanente /etc/nginx/ape-selftest/playlist_master4k.m3u8: ANTES (sha256:4A96480B…) RESOLUTION=3840x2160 + CODECS="hvc1.2.4.L153.B0,…" → DESPUÉS (sha256:87CAB2A2…) RESOLUTION=7680x4320 con el MISMO CODECS. Headers: X-APE-UHD: 8k:1 · X-APE-URI-Rebased: 2',
  observedEv: `${cite('E_M_REWRITE')} · ${cite('E_L_DIFF', '§3/§5.2')}`,
  status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'El rewrite CREA la violación: 8K declarado sobre un nivel que el propio fichero deja intacto. No hay freeze (CODECS no se toca), hay pérdida de calidad por rechazo de variante.' });

row({ id: 'E4-M3', edge: 'listas→VPS-served', profile: '—', family: 'A meta (`/meta/`)',
  expected: 'Ruta de rewrite metadata-only alcanzable para cualquier host:puerto que use el catálogo',
  expectedEv: `${cite('E_VPS_T', ':288 (regex ape_host=[A-Za-z0-9._-]+) y :819')}`,
  observed: 'https 443 /meta/… → 404 (no incluido en el vhost); :8088 /meta/127.0.0.1:8088/… → 404 porque la regex no admite ":" (los proveedores Xtream se direccionan host:puerto)',
  observedEv: `${cite('E_L_DIFF', '§5.4')} · ${cite('E_VPS_NGINX')}`, status: 'UNKNOWN', impact: 'NONE',
  note: 'UNKNOWN con motivo: superficie inexistente/inutilizable ⇒ no hay observación de rewrite que comparar contra la lista. No se declara PASS por ausencia.' });

row({ id: 'E4-M4', edge: 'listas→VPS-served', profile: '—', family: 'A SHIELDED (sufijo de archivo)',
  expected: 'SHIELDED = sólo sufijo _SHIELDED en el nombre; las URLs de canal NO se envuelven con /shield/',
  expectedEv: 'Manifiesto OMEGA Ley 5 · CLAUDE.md «SHIELDED Architecture» · D-33',
  observed: 'curl https://127.0.0.1/shield/… → 404 (medido por t9); en el catálogo servido: 0 ocurrencias de "/shield/" y 0 de "/cdn/" en 22.271.732 líneas; el payload de la variante _SHIELDED es byte-idéntico al plain',
  observedEv: `${cite('E_M_REWRITE')} · ${cite('E_L_INV', '§1.2 (A5 ≡ A4)')} · ${cite('E_L_DIFF', '§1')}`,
  status: 'PASS', impact: 'NONE', note: 'La Ley 5 se cumple en producción; la contradicción es del manifiesto, no del artefacto (DOC_DEBT).' });

row({ id: 'E4-M5', edge: 'listas→VPS-served', profile: '—', family: 'B (repo → no servida)',
  expected: 'Correspondencia lista del repo ↔ artefacto servido trazable por hash',
  expectedEv: 'Manifiesto OMEGA flujo paso 4 (upload HTTP) · D-06',
  observed: 'La subida es HTTP (upload_chunk.php + finalize_upload.php), no git: _vps_stage/**/*.m3u8* = 4 fixtures (203/349/377/378 B). No existe espejo de /var/www/lists ni versionado de las 7 listas servidas',
  observedEv: `${cite('E_L_INV', '§2.1')} · ${cite('E_VPS_DRIFT', '§8 (4 UNKNOWN por diseño)')}`,
  status: 'UNKNOWN', impact: 'NONE',
  note: 'UNKNOWN por diseño (no por falta de trabajo): la trazabilidad se reconstruye por el #EXT-X-APE-AUDIT-SCORECARD embebido, no por hash de archivo.' });

/* ===== E5 · VPS-served → contrato de player ================================= */
row({ id: 'E5-P0', edge: 'VPS-served→player', profile: 'P0', family: 'A',
  expected: 'La variante que el decoder recibe para P0 debe ser decodable: nivel >= capacidad(res,fps)',
  expectedEv: 'Manifiesto OMEGA Ley 1 (tabla L93..L186)',
  observed: '100 STREAM-INF P0: 3840x2160@60 con hvc1.2.4.L120.B0 (MaxLumaPs L120 = 2.228.224 px < 8.294.400 px de 4K) y 3840x2160@30 con L123 (idem)',
  observedEv: `${cite('E_M_PROF')} · ${cite('E_L_CODEC', '§1.1')}`, status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'Un decoder que valide perfil/nivel (ExoPlayer MediaCodec, algunas Smart TV) descarta la variante ⇒ el ABR cae a 1080p.' });

row({ id: 'E5-P1', edge: 'VPS-served→player', profile: 'P1', family: 'A',
  expected: 'idem', expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: '909 STREAM-INF P1: 4K con L123 (737) / L120 (172) — nivel por debajo de la resolución',
  observedEv: `${cite('E_M_PROF')} · muestra real: gz línea 35.279`, status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'Mismo efecto que P0, sobre el 6,3 % de las variantes.' });

row({ id: 'E5-P2', edge: 'VPS-served→player', profile: 'P2', family: 'A',
  expected: 'idem', expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: 'sin variantes P2 en el catálogo', observedEv: `${cite('E_M_PROF')}`,
  status: 'UNKNOWN', impact: 'CHAIN_BREAK?', note: 'UNKNOWN con motivo: no hay contrato observable para P2.' });

row({ id: 'E5-P3', edge: 'VPS-served→player', profile: 'P3', family: 'A',
  expected: 'idem', expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: '1080p@30 con L150 (L150 = 4K@30 ⇒ sobra capacidad) y 1080p@60 con L123 (L123 = 1080p@60 ⇒ exacto). 6 líneas 4K@60+L120 quedan fuera (contadas en E3-P3)',
  observedEv: `${cite('E_M_PROF')}`, status: 'PASS', impact: 'NONE',
  note: 'Nivel coherente con lo declarado para el 99,95 % de las líneas P3. PASS de esta arista; la incoherencia con el SSOT se registra en E3-P3.' });

row({ id: 'E5-P4', edge: 'VPS-served→player', profile: 'P4', family: 'A',
  expected: 'idem', expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: '1080p@30+L150 y 1080p@60+L123: nivel coherente con lo declarado',
  observedEv: `${cite('E_M_PROF')}`, status: 'PASS', impact: 'NONE',
  note: 'PASS en nivel↔resolución; el desajuste perfil↔resolución se registra en E3-P4.' });

row({ id: 'E5-P5', edge: 'VPS-served→player', profile: 'P5', family: 'A',
  expected: 'idem', expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: '1080p con L150/L123: nivel coherente', observedEv: `${cite('E_M_PROF')}`,
  status: 'PASS', impact: 'NONE', note: 'idem: PASS de nivel, desajuste de perfil en E3-P5.' });

row({ id: 'E5-C1', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: 'Cada canal debe declarar su variante (CODECS/RESOLUTION) o el player no puede decidir decodificación',
  expectedEv: 'RFC 8216 §4.3.4.2 (EXT-X-STREAM-INF) + skill ext-x-stream-inf-builder',
  observed: '23.510 #EXTINF vs 14.343 #EXT-X-STREAM-INF ⇒ 9.167 canales (39,0 %) se sirven SIN declaración de códec/resolución',
  observedEv: `${cite('E_M_PROF')} · ${cite('E_L_RFC', 'A-06')}`, status: 'FAIL', impact: 'LAW:L3',
  note: 'El player recibe URL desnuda: no hay contrato de calidad que honrar.' });

row({ id: 'E5-C2', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: '#EXT-X-I-FRAME-STREAM-INF requiere el atributo URI (obligatorio)',
  expectedEv: 'RFC 8216 §4.3.4.3',
  observed: '23.510 líneas #EXT-X-I-FRAME-STREAM-INF y 0 con URI= (medido por t9 sobre el .gz)',
  observedEv: `${cite('E_M_PROF')} · ${cite('E_L_RFC', 'A-01')}`, status: 'FAIL', impact: 'LAW:L3',
  note: 'Desviación sistémica del generador, no de una lista. TiviMate/hls.js lo ignoran; los validadores estrictos lo marcan.' });

row({ id: 'E5-C3', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: 'Si se declara CAN-BLOCK-RELOAD=YES debe existir la implementación de _HLS_msn/_HLS_part',
  expectedEv: 'draft-pantos-hls-rfc8216bis (EXT-X-SERVER-CONTROL) · skill can-block-reload-handler',
  observed: 'La cabecera del catálogo declara #EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0 (línea 6); grep -rn "_HLS_msn|_HLS_part" /etc/nginx/ = 0 coincidencias',
  observedEv: `${cite('E_M_REWRITE', '(head del .gz: línea 6)')} · ${cite('E_L_DIFF', '§5.3')} · ${cite('E_L_RFC', 'A-03')}`,
  status: 'FAIL', impact: 'LAW:L3',
  note: 'Declara una capacidad que el servidor no tiene: el player puede quedarse recargando el manifest.' });

row({ id: 'E5-C4', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: 'GOLDEN RULE: hvc1.* sólo en STREAM-INF CODECS; hev1.* sólo en KODIPROP/EXTVLCOPT/tags de player',
  expectedEv: 'CLAUDE.md «Truth-guard HEVC-first» · skill iptv-hevc-cascade-injector',
  observed: 'hvc1.2.4.* en 14.343/14.343 STREAM-INF · hev1 en 0 STREAM-INF · hev1.2.4.L150.B0 en 23.510 tags #EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1 (sitio correcto)',
  observedEv: `${cite('E_L_CODEC', '§1.5')}`, status: 'PASS', impact: 'NONE',
  note: 'La cascada dual está bien construida: uno de los pocos bordes sin defecto en producción.' });

row({ id: 'E5-C5', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: 'El códec de audio debe viajar dentro de CODECS (riesgo #1 del skill Crystal: perder audio al reescribir CODECS)',
  expectedEv: 'skill ape-crystal-edge §4 «preservar el audio»',
  observed: '14.343/14.343 STREAM-INF incluyen mp4a.40.2 dentro de CODECS; 0 STREAM-INF sin audio',
  observedEv: `${cite('E_L_CODEC', '§1.2')} · ${cite('E_M_REWRITE', '(diff físico: audio intacto en /cdn/)')}`,
  status: 'PASS', impact: 'NONE', note: '—' });

row({ id: 'E5-C6', edge: 'VPS-served→player', profile: 'todos', family: 'A',
  expected: 'La lista no debe autodeclarar una validación que no cumple',
  expectedEv: 'Doctrina: «No declarar éxito sin pruebas» (AGENTS.md)',
  observed: 'El catálogo embebe su propio scorecard de validación en PASS mientras 1.015 líneas STREAM-INF violan la Ley 1 y el validador propio del resolver marcaría el huérfano',
  observedEv: `${cite('E_L_RFC', 'A-04')}`, status: 'FAIL', impact: 'LAW:L3',
  note: 'Falso PASS embebido: envenena cualquier auditoría que confíe en la lista.' });

row({ id: 'E5-CDN', edge: 'VPS-served→player', profile: 'todos', family: 'A CDN (21.040 canales)',
  expected: 'La variante top servida por /cdn/ debe declarar una resolución que su nivel soporte',
  expectedEv: 'Manifiesto OMEGA Ley 1',
  observed: 'Tras el rewrite, un master 4K@60 con L153 sale declarando 7680x4320 (8K) con el mismo CODECS ⇒ nivel por debajo de la resolución en CADA master 4K servido por /cdn/',
  observedEv: `${cite('E_M_REWRITE')} · ${cite('E_L_DIFF', '§5.2')}`, status: 'FAIL', impact: 'LAW:L1 · CHAIN_BREAK',
  note: 'Afecta al 100 % de los canales de las 2 listas CDN (las más nuevas).' });

row({ id: 'E5-FAM-B', edge: 'VPS-served→player', profile: 'todos', family: 'B (repo)',
  expected: 'idem que A', expectedEv: 'Manifiesto OMEGA Ley 1 + GOLDEN RULE',
  observed: 'hev1.1.6.L153.B0 en STREAM-INF (1.359 canales) + SUPPLEMENTAL-CODECS="lcev.1" inventado + atributos enumerados entrecomillados + EXTM3U fuera de la línea 1 + 6/6 headers tóxicos en 3 listas',
  observedEv: `${cite('E_L_CODEC', '§2.1-§2.3')} · ${cite('E_L_RFC', 'B-01..B-04')} · ${cite('E_L_TRAPS', '§3/§4')}`,
  status: 'FAIL', impact: 'LAW:L1+L5(GOLDEN) · CHAIN_BREAK',
  note: 'Familia no servida hoy; material histórico que reproduce todos los errores de clase.' });

/* ===== E6 · doctrina → realidad ============================================ */
row({ id: 'E6-01', edge: 'doctrina→realidad', profile: '—', family: '—',
  expected: 'Manifiesto OMEGA/ape-crystal-edge: pipeline nginx de 5 fases Lua en /etc/nginx/snippets/shield-location.conf',
  expectedEv: 'docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md (sha256:2D24FC33…) · skill ape-crystal-edge §2',
  observed: 'shield-location.conf NO EXISTE; 13/13 artefactos del pipeline Crystal ausentes; pipeline real = 3 fases (header_filter→body_filter→log); /shield/ → 404 (medido por t9)',
  observedEv: `${cite('E_VPS_DRIFT', '§4')} · ${cite('E_M_REWRITE')} · ${cite('E_DOC')}`,
  status: 'FAIL', impact: 'DOC_DEBT',
  note: 'Deuda DOCUMENTAL, no defecto de producto: la corrección es el documento (D-25/D-32). Desplegar el pipeline para «alinear» violaría iptv-vps-touch-nothing.' });

row({ id: 'E6-02', edge: 'doctrina→realidad', profile: '—', family: '—',
  expected: 'APE Crystal Engine v2.0 en Rust+LuaJIT escuchando en :8084 con /health y /metrics',
  expectedEv: 'Manifiesto OMEGA bloque CRYSTAL-ENGINE-V2 §Motor',
  observed: 'ape-crystal-rust.service = "Unit … could not be found" (is-enabled not-found); ss :8084 = nada; /health y /metrics = 000',
  observedEv: `${cite('E_VPS_DRIFT', '§5')}`, status: 'FAIL', impact: 'DOC_DEBT',
  note: 'Corrección documental (D-25).' });

row({ id: 'E6-03', edge: 'doctrina→realidad', profile: '—', family: '—',
  expected: 'OpenResty (nombrado en manifiesto, SOP y diagramas)',
  expectedEv: 'Manifiesto OMEGA/diagrama D2 «OpenResty / Nginx»',
  observed: 'nginx 1.24.0 stock + ngx_http_lua_module; sin OpenResty',
  observedEv: `${cite('E_VPS_INV', '§2')} · ${cite('E_DOC')}`, status: 'FAIL', impact: 'DOC_DEBT',
  note: 'No cambia el comportamiento observable; sí cambia qué es implementable (p. ej. coexión de fases).' });

row({ id: 'E6-04', edge: 'doctrina→realidad', profile: '—', family: '—',
  expected: 'Telemetría Conviva alimentando la recalibración del LAB (paso 8 del flujo)',
  expectedEv: 'Manifiesto OMEGA flujo paso 8 · CLAUDE.md «QoE Server-Side Observer»',
  observed: 'conviva.db = 0 B / 0 tablas; 7 timers netshield-* inactivos; el catálogo referencia un endpoint conviva-event.php que no tiene almacén',
  observedEv: `${cite('E_VPS_DRIFT', '§6/§7')} · D-27`, status: 'FAIL', impact: 'DOC_DEBT',
  note: 'Prohibido afirmar QoE activa (D-27). El bucle de realimentación no existe.' });

row({ id: 'E6-05', edge: 'doctrina→realidad', profile: '—', family: '—',
  expected: 'Producción == repo (lo que corre es lo commiteado)',
  expectedEv: 'D-04 gate 3 · doctrina de rollback',
  observed: 'HEAD ↔ VPS: 16/16 artefactos byte a byte idénticos (14 módulos Lua + meta-plane.conf + ape-hosts-allow.txt). Única excepción: ape-meta-public.conf con el VPS por delante (v2 2.509 B vs HEAD v1 2.091 B)',
  observedEv: `${cite('E_VPS_DRIFT', '§1/§3.1 (DR-02/DR-03)')}`, status: 'PASS', impact: 'NONE',
  note: 'El «drift» aparente del working tree es WIP ajeno no desplegado (D-11: se compara contra bytes de HEAD, no contra el disco).' });

row({ id: 'E6-06', edge: 'doctrina→realidad', profile: 'P1', family: '—',
  expected: 'La tabla P0–P5 del manifiesto dice P1 = 8K (AV1) av01.0.15M.10 @7680x4320@120',
  expectedEv: 'Manifiesto OMEGA §Codec ladder (tabla P0–P5)',
  observed: 'El Excel canónico dice P1 = 3840x2160 + hvc1.2.4.L153.B0 (C25/C37) y su export fiel lo repite; la hoja se contradice a sí misma en C350 ("av01.0.15M.10,ac-3")',
  observedEv: `${cite('E_EXTRACT', 'C25/C37/C350')} · ${cite('E_M_IDENT', '(export 24/24 fiel)')} · D-22/D-34`,
  status: 'FAIL', impact: 'LAW:L1+L3 (plano documental) · DOC_DEBT',
  note: 'La doctrina y el SSOT discrepan sobre QUÉ es P1. Se resuelve por precedencia D-02 (Excel) y se corrige el documento (D-22/D-34/D-31).' });

// ── Leyes cardinales ────────────────────────────────────────────────────────
const LAWS = [
  { id: 'L1', name: 'LEY DE NIVEL↔RESOLUCIÓN',
    statement: 'El level del codec DEBE poder cargar la RESOLUTION+fps declarados (L153=4K@60 techo; L186=8K@120).',
    verdict: 'FAIL',
    evidence: [
      'Excel: 6/6 perfiles declaran fps=120 con niveles que no lo soportan (P1 L153 4K@60, P2 L150 4K@30, P3 L123 1080p@60, P4 L93 720p@30, P5 AVC L3.0) → ' + cite('E_EXTRACT', '(fila 32 vs fila 37)'),
      'JSON: lab_master copia el defecto y añade 4K sobre P3/P4/P5 → ' + cite('E_M_CANON') + ' · ' + cite('E_JSON_MATRIX', 'ley L1/L11'),
      'APP: resolve_quality_unified.php:5519-5520 declara L153 con FRAME-RATE=120 · ' + cite('E_APP_EMIT', '§7'),
      'listas servidas: 1.015/14.343 STREAM-INF con nivel < resolución (0_P0/0_P1/… medido por t9) → ' + cite('E_M_PROF'),
      'VPS /cdn/: el rewrite crea la violación (4K→8K con CODECS intacto) → ' + cite('E_M_REWRITE'),
    ],
    impact: 'Rompe la cadena en los 5 eslabones. Es exactamente el patrón del freeze 2026-06-08.' },
  { id: 'L2', name: 'LEY SSOT-LAB (no-clamp / no-override)',
    statement: 'El LAB está calibrado: no se sobrescribe su codec/resolución/bitrate sin verificar coherencia.',
    verdict: 'FAIL',
    evidence: [
      'Fake-8K por defecto: fakeMode="8k" cuando window.APE_FAKE_UHD no está definido → m3u8-typed-arrays-ultimate.js:10363-10364, :2500 · ' + cite('E_APP_HARD', 'F-APP-04'),
      'El códec emitido sale de la cascada CSV (codec_chain_video[0] = L153 para los 6 perfiles), NO de settings.codec_full → ' + cite('E_APP_EMIT', '§8 (V1 vs V2)'),
      'BANDWIDTH: max(bitrate×1e6, floor) vs settings.bandwidth_max (P0: 200 M emitido vs 80 M declarado) → ' + cite('E_APP_EMIT', '§6'),
      'AVERAGE-BANDWIDTH usa 0.85 literal vs avg_bandwidth_ratio 0.78 → idem',
    ],
    impact: 'El SSOT deja de mandar: 4 de los 5 atributos de variante los decide el código, no el LAB. D-13 ordena default "0"; el código sigue en "8k".' },
  { id: 'L3', name: 'LEY DE COHERENCIA TRIPLE (Excel ↔ JSON ↔ lista)',
    statement: 'Excel, JSON y lista emitida deben quedar coherentes en todo cambio.',
    verdict: 'FAIL',
    evidence: [
      'P1: Excel 3840x2160 → JSON 7680x4320 → lista 3840x2160 y L123/L120 → ' + cite('E_M_CANON') + ' + ' + cite('E_M_PROF'),
      'P3: Excel 1080p/Main10 L123 → JSON 4K/Main 8-bit L120 → lista 1080p/L150+L123 → idem',
      'P4: Excel 720p/Main10 L93 → JSON 4K/AVC → lista 1080p/L150+L123 → idem',
      'P5: Excel 480p/AVC → JSON 4K/AVC → lista 1080p/L150+L123 → idem',
      'Ningún perfil tiene las tres capas de acuerdo simultáneamente (P0 coincide en Excel/JSON pero la lista no emite P0 8K; P2 no se emite)',
    ],
    impact: 'Es la ley que convierte un defecto local en un freeze. Hoy no hay un solo perfil con la cadena completa coherente.' },
  { id: 'L4', name: 'LEY NO-STRIP (las ~945 directivas trabajan)',
    statement: 'Cada EXTVLCOPT/KODIPROP/EXTHTTP/SESSION-DATA tiene consumidor; nunca adelgazar la lista.',
    verdict: 'PASS',
    evidence: [
      'Catálogo servido: 22.271.732 líneas / 23.510 canales = 947,3 líneas por canal; 23.510 #EXTHTTP (100 % de canales) → ' + cite('E_L_INV', '§1.3') + ' · conteo propio t9: 23.510 #EXTINF / 23.510 #EXT-X-I-FRAME-STREAM-INF / 1 #EXTM3U',
      '24 #EXT-X-SESSION-DATA globales presentes (cabecera del .gz, líneas 8-16) → ' + cite('E_M_REWRITE'),
      'El rewrite de /cdn/ NO elimina directivas: sólo rebasa URIs, descarta líneas en blanco y añade tags → ' + cite('E_L_DIFF', '§4'),
      'Desviación de metadato (no de contenido): settings.headersCount=233 declarado vs 400-402 claves medidas → ' + cite('E_JSON_MATRIX', 'ley L8'),
    ],
    impact: 'La ley se cumple en el artefacto. El claim de headersCount es una mentira de metadato, no un strip.' },
  { id: 'L5', name: 'LEY SHIELDED (URLs verbatim)',
    statement: 'SHIELDED = sólo sufijo de archivo; las URLs de canal son directas al proveedor, verbatim.',
    verdict: 'PASS',
    evidence: [
      'Catálogo servido: 0 ocurrencias de "/shield/" y 0 de "/cdn/" en 22.271.732 líneas → conteo t9 sobre el .gz',
      'curl https://127.0.0.1/shield/… → 404 → ' + cite('E_M_REWRITE'),
      'La variante _SHIELDED tiene payload byte-idéntico a la plain (A5 ≡ A4) → ' + cite('E_L_INV', '§1.2'),
      'Las 5 listas directas sirven 95.776 URLs verbatim a line.tivi-ott.net → ' + cite('E_L_DIFF', '§2'),
    ],
    impact: 'Cumple. La contradicción está en el manifiesto (documenta /shield/ como URL canónica) → DOC_DEBT, no defecto de artefacto (D-33).' },
];

// ── Agregados ───────────────────────────────────────────────────────────────
const byStatus = R.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
const byEdge = {};
for (const r of R) {
  byEdge[r.edge] = byEdge[r.edge] || { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  byEdge[r.edge][r.status]++;
}
const edgeProfiles = {};
for (const r of R) {
  edgeProfiles[r.edge] = edgeProfiles[r.edge] || new Set();
  if (/^P[0-5]$/.test(r.profile || '')) edgeProfiles[r.edge].add(r.profile);
}

const out = {
  schema: 't9-alignment-matrix/1.0',
  task: 't9 / T8 — Matriz de alineación capa↔capa y veredicto (gate de verificación)',
  auditor: 'verificador-alineacion',
  attemptId: '3820167a-e18e-42ea-a71b-80c638a49b5e',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  precedence: 'D-02: (1) Excel canónico Downloads 663EF44E… · (2) contracts/crystal_contracts.json · (3) baseline B1/B0 · (4) lab_master + manifiesto',
  excelCanonical: { path: 'C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm', bytes: 3582019, sha256: '663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A' },
  jsonConsumedByApp: { path: 'IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json', bytes: 280065, sha256: '099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4' },
  jsonFaithfulExport: { path: 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_20260611_020645.json', bytes: 222364, sha256: '6931BAF4BFA4C9EB0E565560220A2328DDBBF68E450B9E8307C6335E01382C93', diffsVsExcel: '0/24' },
  evidencePaths: H,
  totals: { rows: R.length, byStatus, byEdge, profilesCoveredPerEdge: Object.fromEntries(Object.entries(edgeProfiles).map(([k, v]) => [k, [...v].sort()])) },
  familyCoverage: {
    note: 'Las familias de lista solo existen a partir de la capa de lista. E1 (Excel→JSON) y E2 (JSON→APP) son family-agnostic por construcción: hay UN SSOT y UN generador. La exigencia "≥1 fila por familia" se satisface en E3, E4 y E5, que son las aristas donde la familia es una dimensión real.',
    families: [
      { id: 'FAM-A-DIRECT', label: 'A · directa al proveedor, servida por el VPS (5 listas, 95.776 canales)', edgesWithRows: ['APP→listas', 'listas→VPS-served', 'VPS-served→player'] },
      { id: 'FAM-A-SHIELDED', label: 'A · SHIELDED (sufijo de archivo; payload ≡ A4)', edgesWithRows: ['listas→VPS-served'] },
      { id: 'FAM-A-CDN', label: 'A · CDN (`/cdn/`), 2 listas, 21.040 canales — las únicas que atraviesan el rewrite', edgesWithRows: ['listas→VPS-served', 'VPS-served→player'] },
      { id: 'FAM-B-REPO', label: 'B · directa versionada en el repo (22 contenidos distintos, 1.449.276.021 B)', edgesWithRows: ['APP→listas', 'listas→VPS-served', 'VPS-served→player'] },
    ],
  },
  laws: LAWS,
  rows: R,
};

fs.writeFileSync(`${OUT}/ALIGNMENT_MATRIX.json`, JSON.stringify(out, null, 2) + '\n', 'utf8');

// ── Markdown desde la MISMA data ────────────────────────────────────────────
const md = [];
const p = (s = '') => md.push(s);
p('# ALIGNMENT_MATRIX — Matriz de alineación capa↔capa (t9 / T8)');
p();
p('**Tarea:** t9 (T8) · **Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`');
p('**Naturaleza:** gate de verificación · solo lectura sobre producción · cero fixes aplicados.');
p('**Fecha de construcción:** ' + out.generatedAt);
p();
p('**Fuente única de esta tabla:** el mismo array `rows` que genera `ALIGNMENT_MATRIX.json`');
p('(`audit/alignment/2026-10-25/90-matriz/tools/build_matrix.mjs`). El script falla (exit 1) si el nº de filas o los');
p('estados difieren entre `.md` y `.json`: la equivalencia no es una promesa, es una aserción.');
p();
p('## 0. Precedencia aplicada (D-02) y los dos artefactos JSON');
p();
p('| Nivel | Fuente | bytes | sha256 | Veredicto de uso |');
p('|---|---|---:|---|---|');
p(`| 1 | Excel canónico \`Downloads/APE_M3U8_LAB_v8_FIXED.xlsm\` | 3.582.019 | \`663EF44E…52806A\` | **SSOT de celdas** (D-20). Re-hasheado por t9: idéntico |`);
p(`| 2 | \`contracts/crystal_contracts.json\` | 6.053 | \`${H.E_CONTRACTS.sha256.slice(0,12)}…\` | Pin de artefactos VPS; ver §7 |`);
p(`| 3 | \`Downloads/LAB_CALIBRATED_20260611_020645.json\` | 222.364 | \`6931BAF4…\` | **Export FIEL del Excel: 0 diffs/24** |`);
p(`| 4 | \`frontend/lab_master_22.6.0.json\` (= CRYSTAL-4K-UHD) | 280.065 | \`099A1707…\` | **Es el que la APP carga** (\`ape-lab-import-helper.js:36\`); 10 diffs/24 vs Excel |`);
p();
p('> **Hallazgo estructural de t9 (no estaba en el tablero):** el exportador **no** es el culpable. El JSON que el');
p('> repo consume por defecto es un artefacto **distinto** del export canónico y diverge en 10 de 24 celdas mapeadas.');
p('> Todo PASS/FAIL de la arista E1 se refiere al artefacto que la APP carga; el escritor se evalúa aparte (fila `E1-EXPORT`).');
p();
p('## 1. Totales');
p();
p('| Estado | Filas |');
p('|---|---:|');
for (const k of ['PASS', 'FAIL', 'UNKNOWN']) p(`| **${k}** | ${byStatus[k] || 0} |`);
p(`| **TOTAL** | **${R.length}** |`);
p();
p('| Arista | PASS | FAIL | UNKNOWN | Perfiles P0–P5 cubiertos |');
p('|---|---:|---:|---:|---|');
for (const [e, v] of Object.entries(byEdge)) p(`| ${e} | ${v.PASS} | ${v.FAIL} | ${v.UNKNOWN} | ${[...edgeProfiles[e]].sort().join(' ') || '—'} |`);
p();
p('**Regla aplicada:** `UNKNOWN` no es `PASS`. Cada UNKNOWN de esta matriz declara el motivo por el que no se pudo');
p('observar (perfil ausente del catálogo, ruta inexistente, o artefacto no versionado).');
p();
p('### 1.1 Cobertura por familia de lista');
p();
p('Las familias **solo existen a partir de la capa de lista**: E1 (Excel→JSON) y E2 (JSON→APP) son *family-agnostic*');
p('por construcción (hay **un** SSOT y **un** generador, no dos familias). La exigencia «≥1 fila por familia de lista»');
p('se satisface en las tres aristas donde la familia es una dimensión real: **E3, E4 y E5**.');
p();
p('| Familia | Qué es | Aristas con filas propias |');
p('|---|---|---|');
for (const f of out.familyCoverage.families) p(`| **${f.id}** | ${f.label} | ${f.edgesWithRows.join(' · ')} |`);
p();

const EDGES = ['Excel→JSON', 'JSON→APP', 'APP→listas', 'listas→VPS-served', 'VPS-served→player', 'doctrina→realidad'];
const EDGE_TITLE = {
  'Excel→JSON': 'E1 · Excel → JSON',
  'JSON→APP': 'E2 · JSON → APP (generador JS + resolver PHP)',
  'APP→listas': 'E3 · APP → listas .m3u8 (familia VPS y familia directa)',
  'listas→VPS-served': 'E4 · listas → VPS-served',
  'VPS-served→player': 'E5 · VPS-served → contrato de player',
  'doctrina→realidad': 'E6 · doctrina → realidad (deuda documental)',
};
let n = 0;
for (const e of EDGES) {
  const rows = R.filter((r) => r.edge === e);
  p(`## 2.${EDGES.indexOf(e) + 1}. ${EDGE_TITLE[e]}`);
  p();
  p('| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |');
  p('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    n++;
    const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    p(`| ${r.id} | ${r.profile} | ${r.family} | ${esc(r.expected)}<br><sub>${esc(r.expectedEv)}</sub> | ${esc(r.observed)}<br><sub>${esc(r.observedEv)}</sub> | **${r.status}** | ${esc(r.impact)} |`);
  }
  p();
  p('**Notas de fila:**');
  p();
  for (const r of rows) p(`- **${r.id}** — ${r.note}`);
  p();
}

p('## 3. Las 5 leyes cardinales, una por una');
p();
for (const L of LAWS) {
  p(`### ${L.id} · ${L.name} — **${L.verdict}**`);
  p();
  p(`> ${L.statement}`);
  p();
  for (const e of L.evidence) p(`- ${e}`);
  p();
  p(`**Impacto:** ${L.impact}`);
  p();
}

p('## 4. Verificación física ejecutada por este verificador (read-only)');
p();
p('| # | Comprobación | Comando | Resultado | Evidencia |');
p('|---|---|---|---|---|');
p(`| 1 | Hash del .xlsm canónico | \`Get-FileHash -Algorithm SHA256\` | 3.582.019 B · \`663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A\` · mtime 2026-06-11T01:54:49-05:00 · **coincide con D-20** | ${cite('E_M_SYNTAX')} |`);
p(`| 2 | Hash del JSON baseline + identidad del export | \`extract_canon.mjs\` + \`which_json_is_the_export.mjs\` | B1 \`FFD3E0E0…\` 408.126 B · B2 \`29C54805…\` 408.174 B · B0 \`D2582BE7…\` 847.417 B · export 20260611 \`6931BAF4…\` **0 diffs/24** | ${cite('E_M_IDENT')} |`);
p(`| 3 | \`node -c\` del generador | \`node --check\` × 4 | 4/4 **EXIT 0**, stderr vacío (node v24.12.0) | ${cite('E_M_SYNTAX')} |`);
p(`| 4 | \`php -l\` con el PHP portable del capitán (D-17) | \`php-8.3/php.exe -l\` × 6 | **6/6 "No syntax errors detected", EXIT 0** (PHP 8.3.36) | ${cite('E_M_SYNTAX')} · ${cite('E_PHP_LINT')} |`);
p(`| 5 | Hash de una lista servida | \`sha256sum\` + \`stat\` + \`gzip -t\` en el VPS | \`7F1CD8A7…CCC360\` · 297.134.088 B · mtime 2026-10-25T17:56:21Z · **coincide con t8** | ${cite('E_M_REWRITE')} |`);
p(`| 6 | Diff de un manifest reescrito vs su lista directa | \`curl\` :8088 (antes) vs \`curl\` /cdn/443 (después) + \`diff\` | ANTES \`4A96480B…\` == sha del fichero en disco · DESPUÉS \`87CAB2A2…\` · 4 líneas cambiadas (RESOLUTION 3840x2160→7680x4320, 2 URIs absolutizadas, +1 tag) | ${cite('E_M_REWRITE')} |`);
p(`| 7 | Gateway de contratos (D-11) | \`node contracts/verify_contracts.mjs\` | RESULT=FAIL (1/12): sólo \`_vps_stage/tests/fanout_concurrency.sh\`; pin \`9b774bff…\` == **bytes de HEAD** (98.126 B) ≠ disco (99.666 B, WIP ajeno) ⇒ **CONTRACT_DRIFT**, no FAIL de alineación | ${cite('E_M_CONTRACTS')} · ${cite('E_CONTRACTS')} |`);
p(`| 8 | Censo del catálogo servido por perfil | \`zcat | grep | sed | sort | uniq -c\` | 14.343 STREAM-INF agrupados: P0 100 · P1 909 · **P2 0** · P3 13.167 · P4 38 · P5 129 | ${cite('E_M_PROF')} |`);
p(`| 9 | Leyes 4/5 sobre el artefacto real | \`zcat | grep -c\` | \`#EXTINF\`=23.510 · \`#EXT-X-STREAM-INF\`=14.343 · \`I-FRAME\`=23.510 (0 con URI) · \`/shield/\`=**0** · \`/cdn/\`=0 · \`#EXTM3U\`=1 | ${cite('E_M_PROF')} |`);
p();
p('## 5. Qué NO prueba esta matriz');
p();
p('- **No** prueba comportamiento de player real: no hay ejecución de ExoPlayer/hls.js/TiviMate. El estado');
p('  "FAIL" por nivel↔resolución es una **inferencia de especificación** (MaxLumaPs de HEVC Annex A), no una medición');
p('  de rechazo en dispositivo. Se declara así para no inflar el resultado.');
p('- **No** cubre el perfil P2 de las aristas E3/E4/E5: no existe en el catálogo servido (UNKNOWN declarado).');
p('- **No** cubre la familia CDN (`/cdn/`) por perfil: sólo se midió el mecanismo de rewrite sobre un fixture maestro.');
p('- **No** afirma nada sobre los 32 UNKNOWN de `40-vps/VPS_DRIFT_VS_REPO.md` (sin hash no hay veredicto).');
p('- **No** re-audita secretos ni credenciales: eso vive en `20-json/SECRETS_SCAN.md` y `80-seguridad/`.');
p();

fs.writeFileSync(`${OUT}/ALIGNMENT_MATRIX.md`, md.join('\n') + '\n', 'utf8');

// ── Aserción de equivalencia MD ↔ JSON ──────────────────────────────────────
const mdText = fs.readFileSync(`${OUT}/ALIGNMENT_MATRIX.md`, 'utf8');
const mdRows = mdText.match(/^\| E\d-[A-Z0-9-]+ \|/gm) || [];
const jsonRows = JSON.parse(fs.readFileSync(`${OUT}/ALIGNMENT_MATRIX.json`, 'utf8')).rows;
let mismatch = 0;
for (const r of jsonRows) {
  const line = mdText.split('\n').find((l) => l.startsWith(`| ${r.id} |`));
  if (!line) { console.error(`MISSING IN MD: ${r.id}`); mismatch++; continue; }
  if (!line.includes(`**${r.status}**`)) { console.error(`STATE MISMATCH ${r.id}: md=${line.match(/\*\*(PASS|FAIL|UNKNOWN)\*\*/)?.[1]} json=${r.status}`); mismatch++; }
}
console.log(`rows_json=${jsonRows.length} rows_md=${mdRows.length} md_row_assertions=${jsonRows.length} mismatches=${mismatch}`);
console.log(`byStatus=${JSON.stringify(byStatus)}`);
console.log(`laws=${LAWS.map((l) => l.id + ':' + l.verdict).join(' ')}`);
if (mismatch !== 0 || mdRows.length !== jsonRows.length) { console.error('EQUIVALENCE FAILED'); process.exit(1); }
console.log('EQUIVALENCE OK (md ↔ json: mismo nº de filas y mismos estados)');
