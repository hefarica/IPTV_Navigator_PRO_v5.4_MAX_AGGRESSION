// contracts/build_contracts.mjs — construye crystal_contracts.json con SHA-256 REALES
//
// Regla de oro: aquí NO se escribe a mano ningún hash. Todo se computa de los
// bytes en disco. El "pin" del contrato es el hash del JSON canónico (sin el
// propio campo de master), de modo que cualquier cambio de artefacto o de
// parámetro invalida el pin y verify_contracts.mjs lo detecta.
//
// Uso:
//   node contracts/build_contracts.mjs [--manifest <ruta-m3u8>] [--out <ruta>]

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const OUT = resolve(ROOT, getArg('--out', 'contracts/crystal_contracts.json'));
const MANIFEST = getArg('--manifest', null);

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ── Artefactos a pinar: SOLO los que este contrato gobierna (media-fan-out V3) ──
// No se pinan ficheros de otras líneas de trabajo (frontend/backend) porque
// cambian bajo locks ajenos y romperían el pin sin que este contrato tenga culpa.
const ARTIFACTS = [
  '_vps_stage/media/ape-supervisor.sh',
  '_vps_stage/media/ape-supervisor.lua',
  '_vps_stage/media/ape-supervisor@.service',
  '_vps_stage/media/ape-ingest.sh',
  '_vps_stage/media/ape-ingest@.service',
  '_vps_stage/lua/ape_session.lua',
  '_vps_stage/lua/ape_caps.lua',
  '_vps_stage/nginx/media-fanout.conf',
  '_vps_stage/tests/fanout_concurrency.sh',
];

const artifacts = {};
const missing = [];
for (const rel of ARTIFACTS) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) { missing.push(rel); continue; }
  artifacts[rel] = { sha256: sha256File(abs), bytes: readFileSync(abs).length };
}
if (missing.length) {
  console.error(`FALTAN artefactos: ${missing.join(', ')}`);
  process.exit(2);
}

// ── Perfiles: los del encargo, con la verdad medida grabada al lado ──────────
const PROFILES = {
  P1_8K_CRYSTAL: {
    input: '4K', output: [7680, 4320],
    scale: 'lanczos', sharpen: 'unsharp=5:5:0.60', hdr: 'pq_metadata_only',
    feasible_on_current_vps: false,
    measured_note: '4K x265 ya mide 0,356x tiempo real en este VPS (0,356 core·s/s por s de video, 3 vCPU). 8K son ~4x pixeles => NO-GO en vivo. Requiere nodo GPU.',
    requires_gpu_node: true,
  },
  P2_1080_4K_CRYSTAL: {
    input: '1080p', output: [3840, 2160],
    scale: 'lanczos', sharpen: 'unsharp=5:5:0.80', hdr: 'pq_metadata_only',
    feasible_on_current_vps: false,
    measured_note: 'Upscale+encode 4K no sostiene tiempo real en 3 vCPU. Válido como proceso OFFLINE por lotes.',
    requires_gpu_node: false,
  },
  P3_720_4K_CRYSTAL: {
    input: '720p', output: [3840, 2160],
    scale: 'bicubic', sharpen: 'unsharp=5:5:0.90', hdr: 'pq_metadata_only',
    feasible_on_current_vps: false,
    measured_note: 'Idem P2: offline por lotes, no live.',
    requires_gpu_node: false,
  },
  P4_480_4K_CRYSTAL: {
    input: '480p', output: [3840, 2160],
    scale: 'neighbor+unsharp_fuerte', sharpen: 'unsharp=7:7:1.20', hdr: 'pq_metadata_only',
    feasible_on_current_vps: false,
    measured_note: 'Idem P2. Calidad subjetiva: el realce agresivo amplifica artefactos de compresión de la fuente.',
    requires_gpu_node: false,
  },
  P5_480_1080_CRYSTAL: {
    input: '480p/576p', output: [3840, 2160],
    scale: 'two_stage(1080->4K)', sharpen: 'unsharp=5:5:0.70', hdr: 'pq_metadata_only',
    feasible_on_current_vps: false,
    measured_note: 'Dos etapas = dos kernels; más suave que P4 pero sigue siendo offline.',
    requires_gpu_node: false,
  },
};

const CONTRACTS = {
  't32-default-8k-v1': {
    contract_id: 't32-default-8k-v1',
    description: 'Contrato por defecto: 4K->8K para fuentes 4K, resto a 4K.',
    max_output_resolution: [7680, 4320],
    max_bitrate_mbps: 80,
    frame_rate: 60,
    codecs: ['hevc', 'h264'],
    hdr_mode: 'pq_metadata_only',
    hdr_caveat: 'PQ se emite como metadata de display; NO se inventa Dolby Vision profile 10 (requiere RPU + bitstream DV real). DV10 RECHAZADO.',
    dv_profile_10: false,
    profile_map: {
      '8K': 'P1_8K_CRYSTAL', '4K': 'P1_8K_CRYSTAL', 'FHD': 'P2_1080_4K_CRYSTAL',
      'HD': 'P3_720_4K_CRYSTAL', 'SD': 'P4_480_4K_CRYSTAL', 'UNKNOWN': 'P3_720_4K_CRYSTAL',
    },
    headers: {
      'X-Crystal-Contract': 't32-default-8k-v1',
      'X-Profile-Default': 'P1_8K_CRYSTAL',
      'X-Max-Resolution': '7680x4320',
      'X-HDR-Mode': 'pq_metadata_only',
      'X-Frame-Rate': '60.000',
      'X-Bitrate-Ceil': '80M',
    },
  },
  't32-roku-4k-v1': {
    contract_id: 't32-roku-4k-v1',
    description: 'Contrato Roku: todo capado a 4K y familia h264.',
    max_output_resolution: [3840, 2160],
    max_bitrate_mbps: 35,
    frame_rate: 60,
    codecs: ['h264'],
    hdr_mode: 'pq_metadata_only',
    hdr_caveat: 'Mismo caveat que default: metadata PQ, sin DV inventado.',
    dv_profile_10: false,
    profile_map: {
      '8K': 'P2_1080_4K_CRYSTAL', '4K': 'P2_1080_4K_CRYSTAL', 'FHD': 'P2_1080_4K_CRYSTAL',
      'HD': 'P3_720_4K_CRYSTAL', 'SD': 'P4_480_4K_CRYSTAL', 'UNKNOWN': 'P3_720_4K_CRYSTAL',
    },
    headers: {
      'X-Crystal-Contract': 't32-roku-4k-v1',
      'X-Profile-Default': 'P2_1080_4K_CRYSTAL',
      'X-Max-Resolution': '3840x2160',
      'X-HDR-Mode': 'pq_metadata_only',
      'X-Frame-Rate': '60.000',
      'X-Bitrate-Ceil': '35M',
      'X-Roku-Override': 'active',
    },
  },
};

// ── Manifest (opcional): pin real del m3u8 servido ──────────────────────────
let manifest = null;
if (MANIFEST) {
  const abs = resolve(ROOT, MANIFEST);
  if (!existsSync(abs)) { console.error(`Manifest no existe: ${MANIFEST}`); process.exit(2); }
  const bytes = readFileSync(abs);
  manifest = {
    path: relative(ROOT, abs).replace(/\\/g, '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    pinned_at: new Date().toISOString(),
  };
}

// ── Documento canónico + master hash (excluyendo el propio master) ───────────
const doc = {
  schema: 'crystal-contracts/v1',
  generated_at: new Date().toISOString(),
  generator: 'contracts/build_contracts.mjs',
  profiles: PROFILES,
  contracts: CONTRACTS,
  artifacts,
  manifest,
};

const canonical = (o) => JSON.stringify(o, Object.keys(o).length ? undefined : undefined);
const stableStringify = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
};

const master = createHash('sha256').update(stableStringify(doc)).digest('hex');
doc.integrity = {
  algorithm: 'sha256',
  master_sha256: master,
  master_scope: 'stable-stringify(doc SIN integrity)',
  artifacts_pinned: Object.keys(artifacts).length,
  note: 'Cualquier cambio en artefactos, perfiles o contratos invalida este pin. verify_contracts.mjs lo comprueba.',
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`OK  ${relative(ROOT, OUT).replace(/\\/g, '/')}`);
console.log(`    artefactos pinados: ${Object.keys(artifacts).length}`);
console.log(`    manifest pinado:    ${manifest ? manifest.sha256.slice(0, 16) + '…' : '(ninguno; usa --manifest)'}`);
console.log(`    MASTER sha256:      ${master}`);
