'use strict';

/**
 * D3 · Generador determinista de los dos JSON-Schema de `/sync` (v2).
 *
 * Fuente única: `ara-x/vps/schema/sync_features.json`.
 * Salidas:      `sync_request.schema.json` + `sync_response.schema.json`.
 *
 * El test `sync_contract.test.js` re-ejecuta la generación y compara byte a byte,
 * de modo que editar un schema a mano sin tocar el catálogo rompe el contrato.
 *
 * Uso:
 *   node ara-x/scripts/gen_sync_schemas.js          # escribe los dos schemas
 *   node ara-x/scripts/gen_sync_schemas.js --check  # sale 1 si hay drift
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'vps', 'schema', 'sync_features.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

const REQUEST_PROV = catalog.provenance.request;
const CONTENT_PROV = catalog.provenance.response_content;
const MAX_AGE_MS = catalog.limits.max_age_ms;
const MAX_CONTENT_AGE_MS = catalog.limits.max_content_age_ms;
const MAX_BODY_BYTES = catalog.limits.max_body_bytes;
const MAX_FEATURES = catalog.limits.max_features;
const MAX_EVENTS = catalog.limits.max_events;

const CLIENT_PLAYERS = ['exoplayer', 'vlc', 'kodi', 'tivimate', 'ott', 'hlsjs', 'other'];
const PLAYBACK_STATES = ['playing', 'paused', 'buffering', 'idle', 'unknown'];
const PROFILE_KEYS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const SAFE_TOKEN = '^[A-Za-z0-9._:+-]{1,64}$'; // R6-D3-DATA-05: sin "://" posible
const ID_TOKEN = '^[A-Za-z0-9._-]{3,128}$';
const ARTIFACT = catalog.artifact;
const ACK = catalog.ack;
const ACK_REASONS = [...ACK.blocking_reasons, ...ACK.warning_reasons, ...ACK.skipped_reasons];

function ackKeySchema() {
  return {
    type: 'string',
    minLength: 1,
    maxLength: ACK.limits.max_key_len,
    pattern: '^[a-z0-9_]+$'
  };
}

/** D4-F02: the L3 device ack rides inside `state.apply` (schema amendment, same batch as R4 §6.5). */
function applyAckSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['st'],
    properties: {
      st: { type: 'string', enum: ACK.states.slice() },
      rs: { type: ['string', 'null'], enum: [...ACK_REASONS, null] },
      etag: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      soc: {
        type: 'object',
        additionalProperties: false,
        required: ['m', 'src', 'c', 'g'],
        properties: {
          m: { type: 'string', enum: catalog.socs.request.slice() },
          src: { type: 'string', enum: ACK.soc_sources.slice() },
          c: { type: 'string', enum: catalog.socs.request.slice() },
          g: { type: 'string', enum: ACK.soc_gates.slice() },
          alias: { type: 'string', pattern: SAFE_TOKEN }
        }
      },
      th: {
        type: 'object',
        additionalProperties: false,
        required: ['prov', 'st', 'steps', 'tier'],
        properties: {
          prov: { type: 'string', enum: ACK.thermal_prov.slice() },
          st: { type: ['integer', 'string', 'null'], enum: [...catalog.thermal.statuses, null] },
          steps: { type: 'integer', minimum: 0, maximum: ACK.limits.max_steps },
          tier: { type: 'string', enum: catalog.processing.tiers.slice() }
        }
      },
      cad: { type: 'integer', minimum: 10, maximum: 120 },
      ap: {
        type: 'array',
        maxItems: ACK.limits.max_lines,
        items: {
          type: 'string',
          minLength: 3,
          maxLength: ACK.limits.max_ap_line_len,
          pattern: '^[a-z_]+ [a-z0-9_]+ -?[0-9]{1,4}$'
        }
      },
      un: { type: 'integer', minimum: 0, maximum: ACK.limits.max_unreachable },
      sk: {
        type: 'array',
        maxItems: ACK.limits.max_lines,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['k', 'r'],
          properties: { k: ackKeySchema(), r: { type: 'string', enum: ACK.skipped_reasons.slice() } }
        }
      },
      cl: {
        type: 'array',
        maxItems: ACK.limits.max_lines,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['k', 'from', 'to'],
          properties: {
            k: ackKeySchema(),
            from: { type: 'integer', minimum: -1000, maximum: 1000 },
            to: { type: 'integer', minimum: -1000, maximum: 1000 }
          }
        }
      },
      df: {
        type: 'array',
        maxItems: ACK.limits.max_lines,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['k', 'r'],
          properties: { k: ackKeySchema(), r: { type: 'string', enum: ACK.defer_reasons.slice() } }
        }
      },
      hl: { type: 'array', maxItems: ACK.limits.max_lines, items: ackKeySchema() },
      ap_trunc: { type: 'boolean' }
    }
  };
}

function artifactRequestSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['artifact_sha256', 'generation_id', 'list_version'],
    properties: {
      artifact_sha256: { type: 'string', pattern: ARTIFACT.sha256_pattern },
      generation_id: { type: 'string', pattern: ARTIFACT.generation_id_pattern },
      list_version: { type: 'string', pattern: ARTIFACT.list_version_pattern }
    }
  };
}

function artifactResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['artifact_sha256', 'generation_id', 'list_version', 'lab_exported_at'],
    properties: {
      artifact_sha256: { type: 'string', pattern: ARTIFACT.sha256_pattern },
      generation_id: { type: 'string', pattern: ARTIFACT.generation_id_pattern },
      list_version: { type: 'string', pattern: ARTIFACT.list_version_pattern },
      lab_exported_at: { type: 'string', pattern: SAFE_TOKEN }
    }
  };
}

function featureValueSchema(def) {
  if (def.type === 'enum') {
    return { type: ['integer', 'string', 'null'], enum: [...def.values, null] };
  }
  return { type: [def.type, 'null'], minimum: def.min, maximum: def.max };
}

function provenanceSchema() {
  return { type: 'string', enum: REQUEST_PROV.slice() };
}

function ageSchema() {
  return { type: ['integer', 'null'], minimum: 0, maximum: MAX_AGE_MS };
}

function contentAgeSchema() {
  return { type: ['integer', 'null'], minimum: 0, maximum: MAX_CONTENT_AGE_MS };
}

function featureSchema(def) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'prov', 'age_ms', 'conf'],
    properties: {
      value: featureValueSchema(def),
      prov: provenanceSchema(),
      age_ms: ageSchema(),
      conf: { type: ['number', 'null'], minimum: 0, maximum: 1 }
    }
  };
}

function buildRequestSchema() {
  const featureProperties = {};
  for (const [name, def] of Object.entries(catalog.features)) {
    featureProperties[name] = featureSchema(def);
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://iptv-ape.duckdns.org/schemas/ara-x/sync_request.schema.json',
    title: 'ARA-X sync request v2 (device -> VPS) — honest telemetry with provenance',
    description:
      'v=2. Cada magnitud viaja como {value, prov, age_ms, conf}. value=null <-> prov=unavailable ' +
      '(nunca 0 por ausencia). content.* no viaja del device: lo aporta el VPS desde el LAB SSOT. ' +
      'ref fija la identidad del catalogo (artifact_sha256 + generation_id), porque las listas son ' +
      'polimorficas entre generaciones (R1 §0.8). client.soc acepta el token canonico o "unknown" ' +
      '+ soc_raw para un SoC no identificado (D4-F10, fail-closed). La firma HMAC sigue siendo ' +
      'ARA-X-SYNC-V1 sobre el body crudo (R6-D3-AUTH-02).',
    type: 'object',
    additionalProperties: false,
    required: ['v', 'type', 'device_id', 'seq', 'ts', 'nonce', 'client', 'ref', 'metrics', 'state'],
    properties: {
      v: { type: 'integer', enum: [2] },
      type: { type: 'string', enum: ['ara_x_sync'] },
      device_id: { type: 'string', pattern: ID_TOKEN },
      seq: { type: 'integer', minimum: 1, maximum: 2147483647 },
      ts: { type: 'integer', minimum: 1, maximum: 4102444800 },
      nonce: { type: 'string', minLength: 16, maxLength: 64, pattern: '^[a-f0-9]+$' },
      client: {
        type: 'object',
        additionalProperties: false,
        required: ['app', 'version', 'soc', 'android', 'player'],
        properties: {
          app: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' },
          version: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9._:+-]+$' },
          soc: { type: 'string', enum: catalog.socs.request.slice() },
          soc_raw: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' },
          android: { type: 'integer', minimum: 7, maximum: 99 },
          player: { type: 'string', enum: CLIENT_PLAYERS.slice() },
          player_version: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9._:+-]+$' }
        }
      },
      ref: artifactRequestSchema(),
      session: {
        type: 'object',
        additionalProperties: false,
        properties: {
          playback_state: { type: 'string', enum: PLAYBACK_STATES.slice() },
          list_version: { type: 'string', pattern: SAFE_TOKEN },
          started_at: { type: 'integer', minimum: 0, maximum: 4102444800 }
        }
      },
      metrics: {
        type: 'object',
        additionalProperties: false,
        required: ['window_s', 'conf', 'features', 'source'],
        properties: {
          window_s: { type: 'integer', minimum: 10, maximum: 60 },
          conf: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          features: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            maxProperties: MAX_FEATURES,
            properties: featureProperties
          },
          source: {
            type: 'object',
            additionalProperties: false,
            required: ['resolution', 'codec', 'fps', 'hdr', 'prov', 'age_ms'],
            properties: {
              resolution: { type: 'string', pattern: '^[0-9]{3,5}x[0-9]{3,5}$' },
              codec: { type: 'string', minLength: 3, maxLength: 128, pattern: '^[A-Za-z0-9._-]+$' },
              fps: { type: 'number', minimum: 1, maximum: 240 },
              hdr: { type: 'string', enum: ['SDR', 'PQ', 'HLG', 'DV'] },
              prov: { type: 'string', enum: ['measured_device', 'measured_server', 'derived', 'unavailable'] },
              age_ms: ageSchema()
            }
          }
        }
      },
      events: {
        type: 'array',
        maxItems: MAX_EVENTS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'prov', 'age_ms'],
          properties: {
            type: { type: 'string', enum: catalog.events.types.slice() },
            code: { type: 'string', enum: catalog.events.codes.slice() },
            prov: provenanceSchema(),
            age_ms: ageSchema(),
            message_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }
          }
        }
      },
      capabilities: {
        type: 'object',
        additionalProperties: false,
        required: ['super_resolution', 'frame_interp', 'glsl', 'media_enhance_api', 'prov'],
        properties: {
          super_resolution: { type: 'boolean' },
          frame_interp: { type: 'boolean' },
          glsl: { type: 'boolean' },
          media_enhance_api: { type: 'boolean' },
          soc_8k: { type: 'string', maxLength: 16 },
          prov: provenanceSchema()
        }
      },
      state: {
        type: 'object',
        additionalProperties: false,
        required: ['active_profile', 'profile_blend'],
        properties: {
          active_profile: { type: 'string', enum: PROFILE_KEYS.slice() },
          profile_blend: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            maxProperties: 6,
            properties: Object.fromEntries(
              PROFILE_KEYS.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])
            )
          },
          policy_etag: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
          apply: applyAckSchema(),
          levers: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: -1000, maximum: 1000 }
          }
        }
      }
    }
  };
}

function buildResponseSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://iptv-ape.duckdns.org/schemas/ara-x/sync_response.schema.json',
    title: 'ARA-X sync response / device policy v2 (VPS -> device)',
    description:
      'Política solucionable por el device sin tocar URLs. v=2 añade display.min_resolution/never_downscale, ' +
      'fps, thermal, processing.tier, degrade.order, content.* con prov=lab_ssot y ref con la identidad ' +
      'del artefacto (artifact_sha256 + generation_id) para decidir si el catálogo local sigue siendo la ' +
      'misma generación. Sin campos URL (R6-D3-SSRF-01).',
    type: 'object',
    additionalProperties: false,
    required: [
      'v', 'type', 'device_id', 'seq', 'ts', 'valid_until', 'policy_etag',
      'profile', 'player', 'device', 'display', 'fps', 'thermal', 'processing', 'degrade', 'controls', 'ref'
    ],
    properties: {
      v: { type: 'integer', enum: [2] },
      type: { type: 'string', enum: ['ara_x_policy'] },
      device_id: { type: 'string', pattern: ID_TOKEN },
      seq: { type: 'integer', minimum: 1, maximum: 2147483647 },
      ts: { type: 'integer', minimum: 1, maximum: 4102444800 },
      valid_until: { type: 'integer', minimum: 1, maximum: 4102444800 },
      policy_etag: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      profile: {
        type: 'object',
        additionalProperties: false,
        required: ['active', 'blend', 'reason'],
        properties: {
          active: { type: 'string', enum: PROFILE_KEYS.slice() },
          blend: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            maxProperties: 6,
            properties: Object.fromEntries(
              PROFILE_KEYS.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])
            )
          },
          reason: { type: 'string', enum: ['nominal', 'thermal_guard', 'stability_guard', 'soc_decode_ceiling', 'offline_safe_default', 'shadow_noop'] }
        }
      },
      player: {
        type: 'object',
        additionalProperties: false,
        required: ['buffer_s', 'abr_bw_factor', 'reconnect_attempts', 'live_delay_s', 'max_bitrate_bps', 'min_bitrate_bps'],
        properties: {
          buffer_s: { type: 'number', minimum: 5, maximum: 120 },
          abr_bw_factor: { type: 'number', minimum: 0.5, maximum: 0.98 },
          reconnect_attempts: { type: 'integer', minimum: 1, maximum: 500 },
          live_delay_s: { type: 'integer', minimum: 1, maximum: 60 },
          max_bitrate_bps: { type: 'integer', minimum: 1000000, maximum: 80000000 },
          min_bitrate_bps: { type: 'integer', minimum: 1000000, maximum: 80000000 }
        }
      },
      device: {
        type: 'object',
        additionalProperties: false,
        required: ['allowed', 'soc', 'thermal_target_c', 'levers'],
        properties: {
          allowed: { type: 'boolean' },
          soc: { type: 'string', enum: catalog.socs.response.slice() },
          thermal_target_c: { type: 'number', minimum: 55, maximum: 85 },
          levers: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: -1000, maximum: 1000 }
          }
        }
      },
      display: {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'wire_resolution', 'min_resolution', 'never_downscale', 'eight_k', 'hdr_hint'],
        properties: {
          mode: { type: 'string', enum: catalog.display.modes.slice() },
          wire_resolution: { type: 'string', enum: catalog.display.wire_resolutions.slice() },
          min_resolution: { type: 'string', enum: catalog.display.min_resolutions.slice() },
          never_downscale: { type: 'boolean' },
          eight_k: { type: 'string', enum: catalog.display.eight_k.slice() },
          hdr_hint: { type: 'string', enum: catalog.display.hdr_hints.slice() }
        }
      },
      fps: {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'current', 'min'],
        properties: {
          target: { type: 'integer', enum: catalog.fps.targets.slice() },
          current: { type: ['number', 'null'], minimum: 1, maximum: catalog.fps.max_measured },
          min: { type: 'integer', enum: [catalog.fps.min] }
        }
      },
      thermal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'limits'],
        properties: {
          status: { type: ['integer', 'string'], enum: catalog.thermal.statuses.slice() },
          limits: {
            type: 'object',
            additionalProperties: false,
            required: catalog.thermal.limit_keys.slice(),
            properties: Object.fromEntries(
              catalog.thermal.limit_keys.map((k) => [
                k,
                { type: 'integer', minimum: catalog.thermal.limits_min_c, maximum: catalog.thermal.limits_max_c }
              ])
            )
          }
        }
      },
      processing: {
        type: 'object',
        additionalProperties: false,
        required: ['tier'],
        properties: { tier: { type: 'string', enum: catalog.processing.tiers.slice() } }
      },
      degrade: {
        type: 'object',
        additionalProperties: false,
        required: ['order'],
        properties: {
          order: {
            type: 'array',
            maxItems: catalog.degrade.max_items,
            uniqueItems: true,
            items: { type: 'string', enum: catalog.degrade.keys.slice() }
          }
        }
      },
      content: {
        type: 'object',
        additionalProperties: false,
        required: [...Object.keys(catalog.content), 'prov', 'age_ms', 'conf'],
        properties: {
          ...Object.fromEntries(
            Object.entries(catalog.content).map(([k, def]) => [
              k,
              { type: def.type, minimum: def.min, maximum: def.max }
            ])
          ),
          prov: { type: 'string', enum: CONTENT_PROV.slice() },
          age_ms: contentAgeSchema(),
          conf: { type: ['number', 'null'], minimum: 0, maximum: 1 }
        }
      },
      controls: {
        type: 'object',
        additionalProperties: false,
        required: ['sync_next_s', 'flags', 'degrade_mask'],
        properties: {
          sync_next_s: { type: 'integer', minimum: 10, maximum: 120 },
          flags: { type: 'array', maxItems: 16, items: { type: 'string', pattern: SAFE_TOKEN } },
          degrade_mask: { type: 'integer', minimum: 0, maximum: 65535 }
        }
      },
      ref: artifactResponseSchema()
    }
  };
}

function serialise(schema) {
  return JSON.stringify(schema, null, 2) + '\n';
}

function outputs() {
  return {
    request: serialise(buildRequestSchema()),
    response: serialise(buildResponseSchema())
  };
}

function write() {
  const out = outputs();
  fs.writeFileSync(path.join(ROOT, 'vps', 'schema', 'sync_request.schema.json'), out.request, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'vps', 'schema', 'sync_response.schema.json'), out.response, 'utf8');
  return out;
}

function check() {
  const out = outputs();
  const reqPath = path.join(ROOT, 'vps', 'schema', 'sync_request.schema.json');
  const resPath = path.join(ROOT, 'vps', 'schema', 'sync_response.schema.json');
  const drift = [];
  if (fs.readFileSync(reqPath, 'utf8') !== out.request) drift.push(path.relative(ROOT, reqPath));
  if (fs.readFileSync(resPath, 'utf8') !== out.response) drift.push(path.relative(ROOT, resPath));
  return drift;
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const drift = check();
    if (drift.length) {
      console.error('SCHEMA DRIFT: ' + drift.join(', ') + ' — corre node ara-x/scripts/gen_sync_schemas.js');
      process.exit(1);
    }
    console.log('schemas OK (sin drift)');
  } else {
    const out = write();
    console.log('escritos sync_request.schema.json (' + out.request.length + ' B) y sync_response.schema.json (' + out.response.length + ' B)');
  }
}

module.exports = { outputs, check, write, buildRequestSchema, buildResponseSchema, catalog, MAX_BODY_BYTES };
