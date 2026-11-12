#!/usr/bin/env node
'use strict';
/**
 * tools/canary/jit_receipt_emitter.js — §4 del prompt: cada ejecucion deja un
 * recibo verificable con los 18 campos.
 *
 * QUE HACE: recibe un DESCRIPTOR (lo que el motor realmente reporto y lo que se
 * midio sobre los artefactos que produjo) y devuelve un recibo con el esquema
 * `ape.canary_jit.receipt.v1`. NO decide si el recibo es valido: eso lo decide
 * el juez real, `validateReceipt` de tools/quality/test_canary_jit_contract.js,
 * que este modulo IMPORTA y no reimplementa.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 *  1. `engine_sha256` se calcula hasheando el fichero del motor. No hay ninguna
 *     ruta de codigo en la que el llamador pueda pasarlo a mano.
 *  2. El estado (`applied.status`) NO es un parametro. Se DERIVA de los hechos
 *     medidos: si no hay cadena de filtros ejecutada y no hay evidencia de
 *     fotograma, el recibo sale NOT_APPLIED aunque el llamador afirme lo
 *     contrario. Un `claimed_status` se ignora y se registra como ignorado.
 *  3. Si falta un campo que el contrato declara obligatorio, el emisor LANZA.
 *     Nunca emite un recibo incompleto "para que pase".
 *
 * USO
 *   const { emitReceipt } = require('./jit_receipt_emitter.js');
 *   const recibo = emitReceipt(descriptor, contractOrPath);
 *
 * Los campos que la ejecucion no produce se declaran NO DISPONIBLES con su
 * razon en `trace`/`not_computed` — no se inventan y no se omiten.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* El juez real. Importarlo NO ejecuta su bateria: esta guardada con
 * `require.main === module` (L1268) y sus exportaciones empiezan en L1276. */
const judge = require('../quality/test_canary_jit_contract.js');

const CONTRACT_PATH = judge.CONTRACT_PATH;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sha256File = (p) => sha256(fs.readFileSync(p));
const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s.toLowerCase());

/** Los 18 campos que exige la seccion 4 del prompt, en su orden literal. */
const PROMPT_FIELDS = [
  'canary_config_sha256', 'profile_sha256', 'device_id', 'session_id', 'channel_id',
  'source_signature', 'requested_processing', 'applied_processing', 'processing_engine',
  'filter_graph_sha256', 'encoder', 'output_codec', 'output_resolution', 'output_fps',
  'output_color', 'output_audio', 'thermal_state', 'fallback_reason'
];

class EmitterError extends Error {
  constructor(code, message) {
    super(code + ': ' + message);
    this.name = 'EmitterError';
    this.code = code;
    this.detail = message;
  }
}

function loadContract(contractOrPath) {
  if (contractOrPath && typeof contractOrPath === 'object') return contractOrPath;
  const p = contractOrPath || CONTRACT_PATH;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ── Normalizacion de un bloque de medidas ──────────────────────────────────
 * Cada valor que entra debe venir con su procedencia. Si el descriptor trae el
 * bloque a medias, se dice que falta; no se rellena. */
function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function require_measured(block, field, code, what) {
  const v = block ? block[field] : undefined;
  if (v === undefined || v === null || v === '') {
    throw new EmitterError(code, 'falta ' + what + '.' + field + ' y es obligatorio: no se emite un recibo incompleto');
  }
  return v;
}

/* ── Derivacion del estado: SOLO desde hechos medidos ───────────────────────
 * APPLIED_MEASURED exige, a la vez: cadena de filtros NO vacia, modo transcode,
 * evidencia de fotograma y fps medido. Cualquier otra cosa es NOT_APPLIED. */
function deriveStatus(descriptor) {
  const recipe = descriptor.recipe || null;
  const filters = recipe && typeof recipe.filtergraph === 'string' ? recipe.filtergraph.trim() : '';
  const codecMode = recipe ? recipe.codec_mode : null;
  const evidence = recipe ? recipe.evidence : null;
  const fps = recipe ? num(recipe.measured_encode_fps) : null;
  const encoder = recipe ? recipe.encoder : null;

  const blockers = [];
  if (!filters) blockers.push('sin applied.filtergraph: no hay cadena que acreditar');
  if (codecMode !== 'transcode') blockers.push('codec_mode=' + JSON.stringify(codecMode) + ' (se exige transcode)');
  if (!evidence || num(evidence.frames) === null || num(evidence.frames) <= 0) blockers.push('sin evidencia de fotograma (frames>0)');
  if (fps === null || fps <= 0) blockers.push('sin fps de codificacion medido');
  if (!encoder) blockers.push('sin bloque encoder');

  if (blockers.length === 0) return { status: 'APPLIED_MEASURED', blockers: [], filters, codecMode };
  return { status: 'NOT_APPLIED', blockers, filters, codecMode };
}

/* ── Emisor ──────────────────────────────────────────────────────────────── */
function emitReceipt(descriptor, contractOrPath) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new EmitterError('E_EMITTER_NO_DESCRIPTOR', 'sin descriptor de ejecucion no hay recibo');
  }
  const contract = loadContract(contractOrPath);
  const schema = (contract.receipt_schema || {}).id;
  if (!schema) throw new EmitterError('E_EMITTER_NO_CONTRACT_SCHEMA', 'el contrato no declara receipt_schema.id');

  /* 1. El motor, por sha256 del fichero. Jamas por ruta ni por literal. */
  const enginePath = descriptor.engine_path;
  if (!enginePath) throw new EmitterError('E_EMITTER_NO_ENGINE_PATH', 'descriptor.engine_path es obligatorio: sin fichero no hay sha que acredite que motor se midio');
  if (!fs.existsSync(enginePath)) throw new EmitterError('E_EMITTER_ENGINE_NOT_FOUND', 'no existe el motor declarado: ' + enginePath);
  const engineSha = sha256File(enginePath);
  const engineReport = descriptor.engine_receipt || null;

  /* 2. Pin de la politica: lo dicta el contrato, no el llamador. */
  const authority = contract.authority_block || {};
  const policySha = String(authority.policy_sha256 || '').toLowerCase();
  if (!isHex64(policySha) || /^0+$/.test(policySha)) {
    throw new EmitterError('E_EMITTER_NO_POLICY_REFERENCE', 'el contrato no trae authority_block.policy_sha256 usable: sin pin, el recibo no queda atado a la receta');
  }
  const policyRevision = authority.policy_revision;

  /* 3. Bloques medidos: la fuente y la salida. Si falta uno, se lanza. */
  const src = descriptor.source || {};
  const out = descriptor.output || {};
  const srcAudio = src.audio || {};
  const outAudio = out.audio || {};

  const sourceBlock = {
    width: num(require_measured(src, 'width', 'E_EMITTER_REQUIRED_MISSING', 'source')),
    height: num(require_measured(src, 'height', 'E_EMITTER_REQUIRED_MISSING', 'source')),
    fps: num(require_measured(src, 'fps', 'E_EMITTER_REQUIRED_MISSING', 'source')),
    transfer: require_measured(src, 'transfer', 'E_EMITTER_REQUIRED_MISSING', 'source'),
    pix_fmt: require_measured(src, 'pix_fmt', 'E_EMITTER_REQUIRED_MISSING', 'source'),
    video_codec: require_measured(src, 'video_codec', 'E_EMITTER_REQUIRED_MISSING', 'source'),
    bitrate_bps: num(require_measured(src, 'bitrate_bps', 'E_EMITTER_REQUIRED_MISSING', 'source')),
    audio: {
      codec: srcAudio.codec === undefined ? null : srcAudio.codec,
      channels: num(require_measured(srcAudio, 'channels', 'E_EMITTER_REQUIRED_MISSING', 'source.audio'))
    }
  };

  const derived = deriveStatus(descriptor);
  const measured = derived.status === 'APPLIED_MEASURED';

  /* `output.filters_applied` no se declara: se DERIVA del estado. Un filtro
   * ejecutado no puede ir en un recibo NOT_APPLIED y un copy no puede llevar
   * filtros (el juez lo rechaza con E_COPY_WITH_FILTERS). */
  const filtersApplied = measured ? descriptor.recipe.filtergraph.split(',').filter(Boolean).length : 0;

  const outputBlock = {
    width: num(require_measured(out, 'width', 'E_EMITTER_REQUIRED_MISSING', 'output')),
    height: num(require_measured(out, 'height', 'E_EMITTER_REQUIRED_MISSING', 'output')),
    fps: num(require_measured(out, 'fps', 'E_EMITTER_REQUIRED_MISSING', 'output')),
    transfer: require_measured(out, 'transfer', 'E_EMITTER_REQUIRED_MISSING', 'output'),
    pix_fmt: require_measured(out, 'pix_fmt', 'E_EMITTER_REQUIRED_MISSING', 'output'),
    video_codec: require_measured(out, 'video_codec', 'E_EMITTER_REQUIRED_MISSING', 'output'),
    level: num(require_measured(out, 'level', 'E_EMITTER_REQUIRED_MISSING', 'output')),
    sar: require_measured(out, 'sar', 'E_EMITTER_REQUIRED_MISSING', 'output'),
    bitrate_bps: num(require_measured(out, 'bitrate_bps', 'E_EMITTER_REQUIRED_MISSING', 'output')),
    audio: {
      codec: outAudio.codec === undefined ? null : outAudio.codec,
      channels: num(require_measured(outAudio, 'channels', 'E_EMITTER_REQUIRED_MISSING', 'output.audio'))
    },
    filters_applied: filtersApplied,
    /* NATIVE solo si la salida no tiene mas pixeles que la fuente. Si crece,
     * es upscale y se declara como tal (el juez rechaza E_FAKE_NATIVE_CLAIM). */
    declared: (Number(out.width) > Number(src.width) || Number(out.height) > Number(src.height))
      ? 'UPSCALE_FROM_SOURCE' : 'NATIVE',
    artifact: {
      path: require_measured(out.artifact || {}, 'path', 'E_EMITTER_REQUIRED_MISSING', 'output.artifact'),
      sha256: require_measured(out.artifact || {}, 'sha256', 'E_EMITTER_REQUIRED_MISSING', 'output.artifact'),
      bytes: num(require_measured(out.artifact || {}, 'bytes', 'E_EMITTER_REQUIRED_MISSING', 'output.artifact'))
    }
  };

  /* 4. Desplegabilidad: NOT_DEPLOYED salvo prueba en contrario. La prueba no
   * puede ser una afirmacion: exige el sha del motor del VPS y filas en el
   * manifiesto. Hoy el motor del VPS es otro artefacto, asi que es NOT_DEPLOYED. */
  const depContract = contract.deployability || {};
  const loopArtifact = depContract.loop_artifact || {};
  const proof = descriptor.deployment_proof || null;
  let deployState = 'NOT_DEPLOYED';
  const depReasons = [];
  if (proof) {
    const vpsSha = String(proof.vps_engine_sha256 || '').toLowerCase();
    if (vpsSha !== engineSha) depReasons.push('el sha del motor medido localmente (' + engineSha.slice(0, 16) + '…) no es el del VPS declarado (' + (vpsSha ? vpsSha.slice(0, 16) + '…' : 'ausente') + ')');
    if (!(Number(proof.manifest_rows) > 0)) depReasons.push('el artefacto no tiene filas en el manifiesto de deploy');
    if (depReasons.length === 0) deployState = 'DEPLOYED';
  } else {
    depReasons.push('sin prueba de despliegue: un recibo de loopback no acredita el VPS');
  }
  const loopArtifactPath = loopArtifact.path
    ? path.resolve(path.dirname(CONTRACT_PATH), '..', loopArtifact.path)
    : null;
  const loopSha = loopArtifactPath && fs.existsSync(loopArtifactPath)
    ? sha256File(loopArtifactPath)
    : (loopArtifact.sha256 ? String(loopArtifact.sha256).toLowerCase() : null);

  /* 5. Bloque `applied`. En NOT_APPLIED solo status/route/engine_sha256 son
   * obligatorios; en APPLIED_MEASURED se exige el resto y se comprueba aqui
   * antes de emitir, no despues. */
  const appliedBlock = {
    status: derived.status,
    route: measured ? 'canary_canonical' : (derived.codecMode === 'copy' ? 'remux_passthrough' : 'no_filtergraph_executed'),
    engine_sha256: engineSha
  };
  if (measured) {
    const recipe = descriptor.recipe;
    const ev = recipe.evidence;
    appliedBlock.codec_mode = recipe.codec_mode;
    appliedBlock.filtergraph = recipe.filtergraph;
    appliedBlock.encoder = recipe.encoder;
    appliedBlock.measured_encode_fps = num(recipe.measured_encode_fps);
    appliedBlock.evidence = {
      frames: num(ev.frames), seconds: num(ev.seconds),
      decode_errors: num(ev.decode_errors), artifact: ev.artifact
    };
    /* Paridad: se COMPUTA con la funcion del juez, no se etiqueta. */
    const parity = judge.computeParity(recipe.filtergraph, (contract.chain || {}).stages || []);
    appliedBlock.parity = { computed: true, derived_from: 'applied.filtergraph', identical: parity.identical === true, missing: parity.missing, extra: parity.extra };
  } else {
    appliedBlock.reason = descriptor.recipe && descriptor.recipe.codec_mode === 'copy'
      ? 'COPY_NO_FILTERGRAPH'
      : 'NO_FILTERGRAPH_EXECUTED';
    appliedBlock.blockers = derived.blockers;
  }

  /* 6. Los 18 campos del prompt §4: cada uno con su path y su fuente, o
   * declarado NO DISPONIBLE con razon. Nada se omite en silencio. */
  const trace = descriptor.trace || {};
  const filtergraphSha = derived.filters ? sha256(Buffer.from(derived.filters, 'utf8')) : null;
  const fieldMap = buildFieldMap({ descriptor, engineReport, engineSha, filtergraphSha, sourceBlock, outputBlock, appliedBlock, trace, policySha, policyRevision, measured });

  /* 7. Recibo. `trace` y `not_computed` viajan DENTRO del recibo: el contrato
   * no los exige, pero §4 pide los 18 campos y aqui estan todos, con su fuente. */
  const receipt = {
    schema,
    engine_sha256: engineSha,
    deployability: {
      state: deployState,
      artifact: loopArtifact.path || null,
      sha256: loopSha,
      manifest_file: depContract.manifest_file || null,
      jit_loop: loopArtifact.implements_canary_jit_loop === true,
      reasons: depReasons
    },
    requested: {
      mode: descriptor.requested_mode || 'CANARY_SPATIAL_4K',
      policy_sha256: policySha,
      policy_revision: policyRevision,
      source: sourceBlock,
      desired: descriptor.desired || null
    },
    applied: appliedBlock,
    output: outputBlock,
    run: {
      channel_id: (engineReport && engineReport.channel) || trace.channel_id || null,
      session_id: (engineReport && engineReport.run_id) || trace.session_id || null,
      session_dir: (engineReport && engineReport.session_dir) || null,
      media_segments: engineReport && engineReport.live ? engineReport.live.media_segments : null,
      media_playlist_bytes: engineReport && engineReport.live ? engineReport.live.media_playlist_bytes : null,
      engine_status: engineReport ? engineReport.status : null,
      engine_reason: engineReport ? engineReport.reason : null,
      measured_at: new Date().toISOString()
    },
    prompt_fields: fieldMap.fields,
    not_computed: fieldMap.not_computed
  };
  if (descriptor.stated_status && descriptor.stated_status !== derived.status) {
    receipt.claimed_status_ignored = {
      claimed: descriptor.stated_status,
      emitted: derived.status,
      why: 'el estado no se acepta del llamador: se deriva de hechos medidos (' + derived.blockers.join('; ') + ')'
    };
  }

  /* 8. Ultima barrera: el walker DEL JUEZ sobre el recibo ya montado. Si el
   * contrato exige algo que no esta, se lanza en vez de entregar a medias. */
  const walk = judge.walkRequiredFields(receipt, contract);
  if (!walk.ok) {
    throw new EmitterError('E_EMITTER_REQUIRED_MISSING', 'el recibo no cumple el contrato: ' + walk.code + ' en ' + walk.path + ' (' + walk.detail + ')');
  }
  return receipt;
}

/* Mapeo de los 18 campos del prompt a un path del recibo, con su fuente. */
function buildFieldMap(ctx) {
  const { descriptor, engineReport, engineSha, filtergraphSha, sourceBlock, outputBlock, appliedBlock, trace, policySha, policyRevision, measured } = ctx;
  const fields = [];
  const notComputed = [];
  const put = (name, pathInReceipt, value, source, reason) => {
    const unavailable = value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value));
    fields.push({ field: name, path: pathInReceipt, value: unavailable ? null : value, source, status: unavailable ? 'NO_DISPONIBLE' : 'MEDIDO' });
    if (unavailable) notComputed.push({ field: name, path: pathInReceipt, reason: reason || 'la ejecucion no produjo este dato' });
  };

  put('canary_config_sha256', 'requested.policy_sha256', policySha,
    'contrato: authority_block.policy_sha256 (pin de la receta de la autoridad)',
    'el contrato no expone otra config de Canary');
  put('profile_sha256', 'prompt_fields[profile_sha256].profile_ref', trace.profile_sha256 || null,
    trace.profile_sha256 ? 'descriptor.trace.profile_sha256 (medido por el llamador)' : 'NO DISPONIBLE',
    'el motor reporta lab_hash truncado a 16 hex (no es un sha256 completo) y aquí no se fabricó uno: ' + JSON.stringify(engineReport ? engineReport.lab_hash : null));
  put('device_id', 'prompt_fields[device_id].device_id', trace.device_id || null,
    'NO DISPONIBLE', 'ejecucion en loopback: no hay dispositivo. Un device_id inventado seria peor que su ausencia');
  put('session_id', 'run.session_id', (engineReport && engineReport.run_id) || null,
    'motor: /image/receipt.run_id (sufijo real de los chunk-<run>-*)');
  put('channel_id', 'run.channel_id', (engineReport && engineReport.channel) || null,
    'motor: /image/receipt.channel');
  put('source_signature', 'prompt_fields[source_signature].signature', trace.source_signature || null,
    trace.source_signature ? 'descriptor.trace.source_signature' : 'NO DISPONIBLE',
    'no se midio una firma de la fuente (la fuente de la prueba es un clip local generado por el test)');
  put('requested_processing', 'requested.desired', descriptor.desired || null,
    'motor: /image/receipt.profile_declared (lo que se pidio)');
  put('applied_processing', 'applied.filtergraph', measured ? appliedBlock.filtergraph : null,
    measured ? 'motor: args del ffmpeg vivo' : 'NO DISPONIBLE',
    'no hubo cadena de filtros: el motor entrego el flujo sin recodificar. Declararlo "medido" con cadena vacia seria contradecirse');
  put('processing_engine', 'engine_sha256', engineSha,
    'sha256 del fichero del motor, calculado aqui: ' + descriptor.engine_path);
  put('filter_graph_sha256', 'prompt_fields[filter_graph_sha256].filter_graph_sha256', filtergraphSha,
    filtergraphSha ? 'sha256 de la cadena aplicada' : 'NO DISPONIBLE',
    'sin cadena ejecutada no hay hash de cadena: declararlo a ceros seria mentir con formato valido');
  put('encoder', 'applied.encoder', measured ? appliedBlock.encoder : null,
    measured ? 'motor: args del ffmpeg vivo (preset/tune/x265-params/rc/gop)' : 'NO DISPONIBLE',
    'codec_mode=' + JSON.stringify(appliedBlock.reason || (descriptor.recipe && descriptor.recipe.codec_mode)) + ': no se recodifico, no hay encoder que acreditar');
  put('output_codec', 'output.video_codec', outputBlock.video_codec, 'ffprobe sobre init+chunk producidos');
  put('output_resolution', 'output.width/height', outputBlock.width + 'x' + outputBlock.height, 'ffprobe sobre init+chunk producidos');
  put('output_fps', 'output.fps', outputBlock.fps, 'ffprobe r_frame_rate sobre init+chunk producidos');
  put('output_color', 'output.transfer', outputBlock.transfer,
    'ffprobe color_transfer sobre los bytes; sin etiqueta de color el valor medido es "unknown", no se supone bt709');
  put('output_audio', 'output.audio', outputBlock.audio,
    'ffprobe sobre init+chunk producidos',
    'la fuente de prueba no tiene pista de audio: 0 canales medidos en ambos lados');
  put('thermal_state', 'prompt_fields[thermal_state].thermal_state', trace.thermal_state || null,
    'NO DISPONIBLE', 'un host de build no tiene estado termico del SoC del dispositivo; NO_COMPUTADO no es "frio"');
  put('fallback_reason', 'applied.reason', appliedBlock.reason || null,
    'derivado por el emisor de los hechos medidos',
    'no hubo fallback declarado por el motor');

  return { fields, not_computed: notComputed };
}

module.exports = {
  emitReceipt,
  deriveStatus,
  PROMPT_FIELDS,
  EmitterError,
  CONTRACT_PATH,
  sha256File
};
