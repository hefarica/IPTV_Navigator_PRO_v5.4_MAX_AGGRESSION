'use strict';

/**
 * Validate a catalog (and its ARA-X layer) against the D1 invariants.
 *
 *   node ara-x/scripts/playlist/validate_cli.js --in <catalog.m3u8> [options]
 *
 * Options:
 *   --expect-channels <n>        fail if #EXTINF != n (Never-Drop)
 *   --expect-url-sha256 <hex>    fail if the aggregate URL hash changed (0 URL mutation)
 *   --require-ara                fail if the ARA block is missing
 *
 * Exit codes: 0 valid · 1 invariant failed · 2 bad usage · 3 error.
 * Pre-existing findings (mixed grammar, I-FRAME without URI, MaxFALL>MaxCLL, …) are REPORTED,
 * never fixed here, and do not fail the run: this layer must not hide them.
 */

const { validateFile } = require('../../playlist/ara_x_validator.js');

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
  if (!args.in) {
    console.error('usage: node validate_cli.js --in <catalog.m3u8> [--expect-channels N] [--expect-url-sha256 HEX] [--require-ara]');
    process.exit(2);
  }
  const started = Date.now();
  const opts = {};
  if (args['expect-channels'] !== undefined) opts.expectChannels = Number(args['expect-channels']);
  if (args['expect-url-sha256'] !== undefined) opts.expectUrlSha256 = String(args['expect-url-sha256']);
  if (args['require-ara'] === true) opts.requireAra = true;

  const report = await validateFile(args.in, opts);
  console.log(JSON.stringify({
    ok: report.ok,
    errors: report.errors,
    preexisting: report.preexisting,
    stats: {
      extinf: report.stats.extinf,
      urls: report.stats.urls,
      streamInf: report.stats.streamInf,
      declaredChannels: report.stats.declaredChannels,
      urlSha256: report.stats.urlSha256,
      blocksWithWrongUrlCount: report.stats.blocksWithWrongUrlCount,
      ara: report.stats.ara
    },
    file: args.in,
    elapsedMs: Date.now() - started
  }, null, 2));
  if (!report.ok) process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(3);
});
