'use strict';

/**
 * Inject the ARA-X layer into a catalog.
 *
 *   node ara-x/scripts/playlist/inject_cli.js --in <catalog.m3u8> --out <out.m3u8> [options]
 *
 * Options: --list-version <v> | --sync-url <url> | --client-type <t> | --per-channel
 *
 * Exit codes: 0 injected or already present · 2 bad usage · 3 not a channel catalog · 1 error.
 */

const fs = require('node:fs');
const path = require('node:path');
const { injectFile } = require('../../playlist/ara_x_injector.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error('usage: node inject_cli.js --in <catalog.m3u8> --out <out.m3u8> [--list-version <v>] [--sync-url <url>] [--client-type <t>] [--per-channel]');
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const started = Date.now();
  const result = await injectFile(args.in, args.out, {
    listVersion: args['list-version'] || 'unknown',
    syncUrl: args['sync-url'],
    clientType: args['client-type'],
    perChannel: args['per-channel'] === true
  });
  console.log(JSON.stringify({ ...result, in: args.in, out: args.out, elapsedMs: Date.now() - started }, null, 2));
  if (!result.injected && result.reason !== 'already_present') process.exit(3);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
