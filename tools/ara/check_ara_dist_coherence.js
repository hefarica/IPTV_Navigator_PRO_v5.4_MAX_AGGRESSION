#!/usr/bin/env node
/**
 * tools/ara/check_ara_dist_coherence.js
 *
 * GATE DE COHERENCIA DE DISTRIBUCION ARA.
 *
 * Verifica que el manifiesto `version.json` describe REALMENTE al APK que se sirve.
 * Nace de un defecto medido: la copia del repo en `vps/ara/version.json` declaraba
 * versionCode 1 / 2.0.0 / sha 91cde550 / size 34192621 mientras el APK desplegado
 * en el VPS era versionCode 6 / 2.3.0-noWG / sha e1d47129 / size 27625887.
 * Desplegar ese manifiesto habria roto el self-update del APK.
 *
 * QUE COMPRUEBA
 *   1. sha256 real del APK  == manifiesto.sha256
 *   2. tamano real del APK  == manifiesto.size
 *   3. versionCode y versionName presentes y con el tipo correcto
 *   4. el APK es un ZIP valido y declara ABIs bajo lib/
 *   5. avisa si falta arm64-v8a o armeabi-v7a (romperia ONN 4K / Fire TV Stick 4K)
 *
 * USO
 *   node tools/ara/check_ara_dist_coherence.js
 *   node tools/ara/check_ara_dist_coherence.js --manifest <ruta> --apk <ruta>
 *   node tools/ara/check_ara_dist_coherence.js --json
 *
 * EXIT
 *   0 = todo coherente
 *   1 = drift o error de estructura
 *   2 = no se pudo leer un fichero de entrada
 *
 * Sin dependencias externas. Node >= 16.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// ── Argumentos ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { json: false, manifest: null, apk: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--apk') out.apk = argv[++i];
    else if (a.startsWith('--manifest=')) out.manifest = a.slice(11);
    else if (a.startsWith('--apk=')) out.apk = a.slice(6);
  }
  return out;
}

const USAGE = `Uso:
  node tools/ara/check_ara_dist_coherence.js [--manifest <version.json>] [--apk <agent.apk>] [--json]

Defaults (relativos a la raiz del repo):
  --manifest IPTV_v5.4_MAX_AGGRESSION/vps/ara/version.json
  --apk      IPTV_v5.4_MAX_AGGRESSION/vps/ara/agent.apk   (si no existe, ver nota de abajo)

Nota: si el APK publicado no vive en el repo (es normal: es un artefacto de build),
pasa --apk explicitamente. Sin APK el gate NO puede declarar coherencia y sale 2.`;

// ── Descubrimiento de raiz del repo ──────────────────────────────────────────
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: dos niveles arriba de tools/ara
  return path.resolve(start, '..', '..');
}

// ── sha256 en streaming (27 MB no caben comodos en memoria en CI) ────────────
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

// ── Lectura de ABIs desde el ZIP central directory ───────────────────────────
// No descomprimimos: leemos el End Of Central Directory + las entradas, que es
// suficiente para saber que rutas lib/<abi>/ existen.
function readZipAbis(file) {
  const buf = fs.readFileSync(file);
  const size = buf.length;

  // Buscar EOCD (0x06054b50) desde el final, hasta 64 KiB + 22 de comentario.
  const maxBack = Math.min(size, 65535 + 22);
  let eocd = -1;
  for (let i = size - 22; i >= size - maxBack && i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    return { ok: false, reason: 'no se encontro el End Of Central Directory (no es un ZIP valido)' };
  }

  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  if (cdCount === 0xffff || cdOffset === 0xffffffff) {
    return { ok: false, reason: 'ZIP64 no soportado por este gate (APK inusualmente grande)' };
  }

  const abis = new Set();
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (p + 46 > size) break;
    if (buf.readUInt32LE(p) !== 0x02014b50) break; // firma de central directory header
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name.startsWith('lib/')) {
      const parts = name.split('/');
      if (parts.length >= 3 && parts[1]) abis.add(parts[1]);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }

  return { ok: true, abis: Array.from(abis).sort(), entries: cdCount };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); process.exit(0); }

  const root = findRepoRoot(__dirname);
  const manifestPath = args.manifest
    ? path.resolve(args.manifest)
    : path.join(root, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ara', 'version.json');
  const apkPath = args.apk
    ? path.resolve(args.apk)
    : path.join(root, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ara', 'agent.apk');

  const report = {
    tool: 'check_ara_dist_coherence',
    version: '1.0.0',
    manifest: { path: manifestPath, exists: false },
    apk: { path: apkPath, exists: false },
    checks: [],
    drift: [],
    warnings: [],
    ok: false,
  };

  const add = (id, ok, detail) => {
    report.checks.push({ id, ok, detail });
    if (!ok) report.drift.push(id);
  };

  // ── Manifiesto ──
  if (!fs.existsSync(manifestPath)) {
    report.checks.push({ id: 'manifest_present', ok: false, detail: `no existe: ${manifestPath}` });
    return emit(report, args.json, 2);
  }
  report.manifest.exists = true;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    report.checks.push({ id: 'manifest_json', ok: false, detail: `JSON invalido: ${e.message}` });
    return emit(report, args.json, 1);
  }
  report.manifest.parsed = true;

  // versionCode / versionName con tipo correcto
  const vc = manifest.versionCode;
  const vn = manifest.versionName;
  add('versionCode_type', Number.isInteger(vc) && vc > 0,
    `versionCode=${JSON.stringify(vc)} (esperado entero > 0)`);
  add('versionName_type', typeof vn === 'string' && vn.trim() !== '',
    `versionName=${JSON.stringify(vn)} (esperado string no vacio)`);
  report.manifest.versionCode = vc;
  report.manifest.versionName = vn;

  const declaredSha = typeof manifest.sha256 === 'string' ? manifest.sha256.toLowerCase() : null;
  const declaredSize = Number.isInteger(manifest.size) ? manifest.size : null;
  add('sha256_declared', declaredSha !== null && /^[a-f0-9]{64}$/.test(declaredSha),
    declaredSha === null ? 'sha256 ausente' : `sha256=${declaredSha}`);
  add('size_declared', declaredSize !== null && declaredSize > 0,
    declaredSize === null ? 'size ausente' : `size=${declaredSize}`);

  // ── APK ──
  if (!fs.existsSync(apkPath)) {
    report.checks.push({
      id: 'apk_present',
      ok: false,
      detail: `no existe: ${apkPath} — pasa --apk <ruta> al APK publicado para verificar coherencia`,
    });
    report.warnings.push(
      'Sin APK no se puede afirmar coherencia. Este gate NO declara OK sin el artefacto.'
    );
    return emit(report, args.json, 2);
  }
  report.apk.exists = true;

  const realSize = fs.statSync(apkPath).size;
  const realSha = (await sha256File(apkPath)).toLowerCase();
  report.apk.size = realSize;
  report.apk.sha256 = realSha;

  add('size_matches', declaredSize !== null && realSize === declaredSize,
    `manifiesto=${declaredSize} real=${realSize}`);
  add('sha256_matches', declaredSha !== null && realSha === declaredSha,
    `manifiesto=${declaredSha} real=${realSha}`);

  // ── ABIs ──
  try {
    const zip = readZipAbis(apkPath);
    report.apk.zip = zip;
    if (!zip.ok) {
      add('zip_valid', false, zip.reason);
    } else {
      add('zip_valid', true, `ZIP valido con ${zip.entries} entradas`);
      report.apk.abis = zip.abis;
      add('abi_present_any', zip.abis.length > 0,
        zip.abis.length ? `ABIs: ${zip.abis.join(', ')}` : 'no hay lib/<abi>/ en el APK (APK sin codigo nativo?)');

      for (const need of ['arm64-v8a', 'armeabi-v7a']) {
        const has = zip.abis.includes(need);
        report.checks.push({
          id: `abi_${need}`,
          ok: has,
          detail: has
            ? `presente (${need})`
            : `AUSENTE — ${need === 'arm64-v8a'
                ? 'no instalaria en ONN 4K / boxes arm64'
                : 'no instalaria en Fire TV Stick 4K (armeabi-v7a)'}`,
        });
        if (!has) {
          report.warnings.push(
            `ABI ${need} ausente: instalacion NO universal (rompe el objetivo generico ONN 4K + Fire TV + cualquier otro).`
          );
        }
      }

      // Coherencia con el manifiesto si declara abis[]
      if (Array.isArray(manifest.abis) && manifest.abis.length) {
        const missing = manifest.abis.filter((a) => !zip.abis.includes(a));
        add('abis_match_manifest', missing.length === 0,
          missing.length ? `el manifiesto declara ABIs que el APK no tiene: ${missing.join(', ')}`
                         : 'abis[] del manifiesto coincide con el APK');
      }
    }
  } catch (e) {
    add('zip_valid', false, `no se pudo leer el APK como ZIP: ${e.message}`);
  }

  report.ok = report.drift.length === 0;
  return emit(report, args.json, report.ok ? 0 : 1);
}

function emit(report, asJson, code) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(code);
  }

  const line = (s) => console.log(s);
  line('══════════════════════════════════════════════════════════════');
  line(' GATE DE COHERENCIA — DISTRIBUCION ARA');
  line('══════════════════════════════════════════════════════════════');
  line(`  manifiesto : ${report.manifest.path}`);
  line(`  apk        : ${report.apk.path}`);
  if (report.manifest.versionCode !== undefined) {
    line(`  declarado  : versionCode ${report.manifest.versionCode} / ${report.manifest.versionName}`);
  }
  if (report.apk.size !== undefined) {
    line(`  real       : ${report.apk.size} B / ${report.apk.sha256}`);
  }
  if (report.apk.abis) {
    line(`  abis       : ${report.apk.abis.join(', ')}`);
  }
  line('──────────────────────────────────────────────────────────────');

  for (const c of report.checks) {
    line(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.id.padEnd(24)} ${c.detail}`);
  }

  if (report.warnings.length) {
    line('──────────────────────────────────────────────────────────────');
    for (const w of report.warnings) line(`  AVISO: ${w}`);
  }

  line('──────────────────────────────────────────────────────────────');
  if (report.ok) {
    line('  VEREDICTO: COHERENTE — el manifiesto describe al APK servido.');
  } else if (report.drift.length) {
    line(`  VEREDICTO: DRIFT en [${report.drift.join(', ')}]`);
    line('  El manifiesto NO describe al APK. Desplegarlo rompe el self-update.');
  } else {
    line('  VEREDICTO: INCOMPLETO — falta el APK u otro dato; no se puede afirmar coherencia.');
  }
  line('══════════════════════════════════════════════════════════════');

  process.exit(code);
}

main().catch((e) => {
  console.error('ERROR inesperado en el gate:', e && e.stack ? e.stack : e);
  process.exit(2);
});
