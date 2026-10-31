#!/usr/bin/env node
'use strict';

/**
 * compose_cli.js — I4 · CLI del compositor de aplicación en device.
 *
 * Uso:
 *   node ara-x/scripts/device/compose_cli.js --policy p.json --measured m.json [--cfg c.json] [--strict]
 *   node ara-x/scripts/device/compose_cli.js --selftest
 *
 * Lee JSON de archivo o de stdin ("-"), compone con `ara-x/device/apply_composer.js` e imprime el
 * resultado en stdout. `--strict` sale con código 1 si la composición no es aplicable
 * (`ok:false` o `allowed:false`), útil como gate de CI.
 */

const fs = require('fs');
const path = require('path');

const composer = require(path.join(__dirname, '..', '..', 'device', 'apply_composer.js'));

function readArg(file) {
  if (!file) return null;
  const raw = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const out = { policy: null, measured: null, cfg: null, strict: false, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--policy') out.policy = argv[++i];
    else if (a === '--measured') out.measured = argv[++i];
    else if (a === '--cfg') out.cfg = argv[++i];
    else if (a === '--strict') out.strict = true;
    else if (a === '--selftest') out.selftest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error('argumento desconocido: ' + a);
  }
  return out;
}

function selftest() {
  const result = composer.compose({
    policy: {
      v: 2,
      device: { allowed: true, soc: 's905x4', levers: { pq_ai_sr_enable: 1, ai_sr_level: 3, pq_sharpness_enable: 1 } },
      display: { wire_resolution: '3840x2160', eight_k: 'presentation_only', never_downscale: true },
      fps: { target: 60 },
      processing: { tier: 'max_image' },
      thermal: { status: 1, limits: { light_c: 58, moderate_c: 64, severe_c: 70, critical_c: 78 } }
    },
    measured: {
      soc: 's905x4',
      thermal: { prov: 'measured', status: 1, temp_c: 57 },
      player_runtime: { buffer_ms: 4200 }
    },
    cfg: { session: 'selftest', values: { pq: 2, hdr: 3 }, ttl: 120 }
  });
  const lines = [
    'ok=' + result.ok,
    'allowed=' + result.allowed,
    'state=' + result.state,
    'soc=' + result.soc.canonical,
    'rows=' + result.rows.length,
    'cfg_bytes=' + (result.cfg ? result.cfg.bytes : 0),
    'tier=' + result.intents.effective_tier,
    'fps=' + result.intents.fps_target,
    'buffer_ms=' + result.intents.buffer_ms
  ];
  console.log(lines.join(' '));
  return result.ok && result.allowed ? 0 : 1;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error('ERROR: ' + e.message);
    return 2;
  }
  if (args.help || (!args.selftest && !args.policy && !args.measured)) {
    console.log('uso: compose_cli.js --policy <file|-> --measured <file|-> [--cfg <file>] [--strict] | --selftest');
    return args.help ? 0 : 2;
  }
  if (args.selftest) return selftest();

  let result;
  try {
    result = composer.compose({
      policy: readArg(args.policy),
      measured: readArg(args.measured),
      cfg: args.cfg ? readArg(args.cfg) : undefined
    });
  } catch (e) {
    console.error('ERROR: ' + e.message);
    return 2;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!args.strict) return 0;
  return result.ok && result.allowed ? 0 : 1;
}

process.exit(main());
