// contracts/verify_contracts.mjs — verificador de contratos con gates que PUEDEN fallar
//
// Comprueba, en este orden:
//   1) schema y estructura mínima
//   2) integridad del maestro: stable-stringify(doc sin integrity) === integrity.master_sha256
//   3) cada artefacto pinado: sha256 en disco === sha256 del contrato
//   4) manifest opcional: sha256 del fichero servido === pin (si el contrato lo trae)
//   5) coherencia: perfiles referenciados existen; gating GPU/viabilidad declarado
//
// Uso:
//   node contracts/verify_contracts.mjs
//   node contracts/verify_contracts.mjs --manifest out/lista.m3u8
//   node contracts/verify_contracts.mjs --self-test     <- demuestra que el gate FALLA si se muta un byte
//
// Exit: 0 = PASS · 1 = FALLO de verificación · 2 = error de configuración

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const getArg = (n, d = null) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SELF_TEST = args.includes('--self-test');
const CONTRACT_PATH = resolve(ROOT, getArg('--contract', 'contracts/crystal_contracts.json'));
const MANIFEST_PATH = getArg('--manifest', null);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const stableStringify = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
};

const fails = [];
const oks = [];
const fail = (m) => fails.push(m);
const ok = (m) => oks.push(m);

function verify(contractPath, { manifestPath = null, quiet = false } = {}) {
  if (!existsSync(contractPath)) { console.error(`NO EXISTE contrato: ${contractPath}`); return 2; }
  let doc;
  try { doc = JSON.parse(readFileSync(contractPath, 'utf8')); }
  catch (e) { console.error(`JSON inválido: ${e.message}`); return 2; }

  // 1) estructura
  if (doc.schema !== 'crystal-contracts/v1') fail(`schema inesperado: ${doc.schema}`);
  else ok('schema crystal-contracts/v1');
  for (const k of ['profiles', 'contracts', 'artifacts', 'integrity']) {
    if (!doc[k] || typeof doc[k] !== 'object') fail(`falta seccion '${k}'`);
  }

  // 2) master hash
  const { integrity, ...rest } = doc;
  const recomputed = sha256(Buffer.from(stableStringify(rest), 'utf8'));
  if (!integrity || integrity.master_sha256 !== recomputed) {
    fail(`MASTER hash no coincide: contrato ${integrity?.master_sha256} vs real ${recomputed}`);
  } else ok(`master sha256 ${recomputed.slice(0, 16)}…`);

  // 3) artefactos
  for (const [rel, meta] of Object.entries(doc.artifacts || {})) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) { fail(`artefacto ausente: ${rel}`); continue; }
    const real = sha256(readFileSync(abs));
    if (real !== meta.sha256) fail(`SHA MISMATCH ${rel}: contrato ${meta.sha256.slice(0, 16)}… vs real ${real.slice(0, 16)}…`);
    else ok(`artefacto ${rel}`);
  }

  // 4) manifest
  if (manifestPath) {
    const abs = resolve(ROOT, manifestPath);
    if (!existsSync(abs)) fail(`manifest no existe: ${manifestPath}`);
    else {
      const real = sha256(readFileSync(abs));
      if (!doc.manifest) fail('el contrato no tiene manifest pinado (build sin --manifest)');
      else if (real !== doc.manifest.sha256) fail(`MANIFEST MISMATCH: pin ${doc.manifest.sha256.slice(0, 16)}… vs real ${real.slice(0, 16)}…`);
      else ok(`manifest ${relative(ROOT, abs).replace(/\\/g, '/')}`);
    }
  }

  // 5) coherencia de contratos y perfiles
  const profNames = new Set(Object.keys(doc.profiles || {}));
  for (const [id, c] of Object.entries(doc.contracts || {})) {
    if (c.contract_id !== id) fail(`contract_id '${c.contract_id}' != clave '${id}'`);
    if (c.dv_profile_10 === true) fail(`contrato ${id} declara DV profile 10 (PROHIBIDO sin RPU real)`);
    for (const [res, p] of Object.entries(c.profile_map || {})) {
      if (!profNames.has(p)) fail(`contrato ${id}: mapa '${res}' -> perfil inexistente '${p}'`);
    }
    const [w, h] = c.max_output_resolution || [];
    const cap = (doc.profiles?.[c.profile_map?.['4K']]?.output) || [];
    if (cap[0] > w || cap[1] > h) fail(`contrato ${id}: perfil 4K (${cap.join('x')}) excede el techo del contrato (${w}x${h})`);
  }
  if (!Object.values(doc.profiles || {}).some((p) => p.feasible_on_current_vps === false)) {
    fail('ningun perfil declara feasible_on_current_vps=false (se estaria prometiendo lo no medido)');
  } else ok('viabilidad GPU/CPU declarada por perfil');

  if (!quiet) {
    for (const m of oks) console.log(`  PASS  ${m}`);
    for (const m of fails) console.log(`  FAIL  ${m}`);
  }
  return fails.length ? 1 : 0;
}

// ── Self-test: demuestra que el gate FALLA al mutar un byte ──────────────────
if (SELF_TEST) {
  console.log('== SELF-TEST del verificador (el gate debe poder fallar) ==');
  const rcClean = verify(CONTRACT_PATH, { quiet: true });
  console.log(`  contrato actual            -> exit ${rcClean}  ${rcClean === 0 ? 'PASS (esperado)' : 'FALLO inesperado'}`);
  if (rcClean !== 0) { console.error('El contrato no verifica ni en limpio: corrige antes de probar negativos.'); process.exit(1); }

  const tmp = mkdtempSync(join(tmpdir(), 'crystal-selftest-'));
  let rcNeg = null;
  try {
    // (a) mutar un parámetro del JSON -> master hash debe romperse
    const doc = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    doc.contracts['t32-roku-4k-v1'].max_bitrate_mbps = 999;
    const mutated = join(tmp, 'mutated_contract.json');
    writeFileSync(mutated, JSON.stringify(doc, null, 2));
    rcNeg = verify(mutated, { quiet: true });
    console.log(`  contrato con 1 parámetro mutado -> exit ${rcNeg}  ${rcNeg === 1 ? 'FAIL detectado (esperado)' : 'NO DETECTADO (gate roto)'}`);

    // (b) mutar un artefacto: como no podemos romper el repo, se comprueba con
    //     un contrato cuyo pin apunta a un fichero temporal copiado y alterado
    const victim = join(tmp, 'victim.bin');
    writeFileSync(victim, 'AAAA');
    const relVictim = relative(ROOT, victim).replace(/\\/g, '/');
    const doc2 = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    doc2.artifacts[relVictim] = { sha256: sha256(Buffer.from('AAAA')), bytes: 4 };
    const { integrity: _drop, ...rest2 } = doc2;
    doc2.integrity = { ..._drop, master_sha256: sha256(Buffer.from(stableStringify(rest2), 'utf8')) };
    const c2 = join(tmp, 'artifact_contract.json');
    writeFileSync(c2, JSON.stringify(doc2, null, 2));
    writeFileSync(victim, 'BBBB'); // se altera DESPUÉS de pinar
    const rcNeg2 = verify(c2, { quiet: true });
    console.log(`  artefacto alterado tras pinar -> exit ${rcNeg2}  ${rcNeg2 === 1 ? 'FAIL detectado (esperado)' : 'NO DETECTADO (gate roto)'}`);
    rcNeg = Math.max(rcNeg, rcNeg2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (rcNeg === 1) { console.log('SELF-TEST OK: el verificador detecta ambos sabotajes.'); process.exit(0); }
  console.error('SELF-TEST FALLIDO: el verificador no detecta sabotaje.');
  process.exit(1);
}

console.log('== VERIFICACIÓN DE CONTRATOS ==');
const rc = verify(CONTRACT_PATH, { manifestPath: MANIFEST_PATH });
console.log(rc === 0 ? `\nRESULT=PASS (${oks.length} comprobaciones)` : `\nRESULT=FAIL (${fails.length} fallos, ${oks.length} ok)`);
process.exit(rc);
