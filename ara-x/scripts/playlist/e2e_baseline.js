'use strict';

/**
 * E2E baseline over a real catalog capture:
 *   input → inject once → analyze → compare invariants → inject twice (idempotency).
 *
 * Writes `reports/V2_e2e_baseline.{json,md}`. No VPS, no network, no URL mutation.
 * Refuses to report PASS on a truncated capture (EXTINF != declared channels).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { injectFile } = require('../../playlist/ara_x_injector.js');
const { analyzeFile, compare } = require('../../playlist/ara_x_validator.js');

const ARA_X_ROOT = path.join(__dirname, '..', '..');
const EVIDENCE = path.join(ARA_X_ROOT, 'evidence');
const REPORT_MD = path.join(ARA_X_ROOT, 'reports', 'V2_e2e_baseline.md');
const REPORT_JSON = path.join(ARA_X_ROOT, 'reports', 'V2_e2e_baseline.json');
const LIST_VERSION = '2026-10-29T11:54:23Z';

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

function defaultInput() {
  const full = path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full.m3u8');
  if (fs.existsSync(full)) return full;
  return path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030.m3u8');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function markdown(result) {
  const rows = ['extinf', 'declaredChannels', 'urls', 'streamInf', 'extattr', 'araVersion', 'araTags', 'blocks', 'blocksWithWrongUrlCount']
    .map((key) => `| ${key} | ${JSON.stringify(result.before[key])} | ${JSON.stringify(result.after[key])} |`)
    .join('\n');
  const checks = result.compare.checks
    .map((c) => `| ${c.name} | ${c.ok ? 'PASS' : 'FAIL'} | ${JSON.stringify(c.before)} | ${JSON.stringify(c.after)} |`)
    .join('\n');
  return `# V2 · E2E baseline ARA-X sobre catálogo real

Fecha: 2026-10-30 · Resultado: **${result.ok ? 'PASS' : 'FAIL'}** · Elapsed: ${result.elapsedMs} ms

## Entrada / salida

| Dato | Valor |
|---|---|
| input | \`${result.input.file}\` (${result.input.bytes} B) |
| input sha256 | \`${result.input.sha256}\` |
| output | \`${result.output.file}\` (${result.output.bytes} B) |
| output sha256 | \`${result.output.sha256}\` |
| segunda pasada | injected=${result.secondPass.injected}, byte-idéntica=${result.secondPass.byteIdentical} |
| bloque ARA | ${result.inject.blockLines} líneas, EOL ${result.inject.eol || 'n/a'} |
| captura completa | ${result.captureComplete} (EXTINF=${result.before.extinf} / declarados=${result.before.declaredChannels}) |

${result.captureComplete ? '' : '> **ATENCIÓN: captura truncada.** El archivo no contiene todos los canales declarados; no se puede usar como verificación del catálogo completo.\n'}

## Invariantes antes/después

| Métrica | Antes | Después |
|---|---|---|
${rows}

## Checks

| Check | Estado | Antes | Después |
|---|---|---|---|
${checks}
| zero_wrong_url_blocks | ${result.zeroWrongBlocks ? 'PASS' : 'FAIL'} | ${result.before.blocksWithWrongUrlCount} | ${result.after.blocksWithWrongUrlCount} |

## Reproducir

\`\`\`powershell
node ara-x/scripts/playlist/e2e_baseline.js --in ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8
\`\`\`

> La salida no se sirve. Este E2E valida la capa de playlist localmente; publicar la lista con el
> bloque ARA-X requiere aprobación/claim del workstream correspondiente.
`;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const input = args.in ? path.resolve(args.in) : defaultInput();
  if (!fs.existsSync(input)) throw new Error('missing catalog capture: ' + input);

  const base = path.basename(input).replace(/\.m3u8?$/i, '');
  const once = path.join(EVIDENCE, base + '_ARA-X_once.m3u8');
  const twice = path.join(EVIDENCE, base + '_ARA-X_twice.m3u8');
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });

  const started = Date.now();
  const before = await analyzeFile(input);
  const inject = await injectFile(input, once, { listVersion: LIST_VERSION });
  const after = await analyzeFile(once);
  const cmp = compare(before, after);

  const second = await injectFile(once, twice, { listVersion: LIST_VERSION });
  const [onceSha, twiceSha] = await Promise.all([sha256File(once), sha256File(twice)]);
  const idempotent = second.injected === false && onceSha === twiceSha;
  const captureComplete = before.declaredChannels > 0 && before.extinf === before.declaredChannels;
  const zeroWrongBlocks = after.blocksWithWrongUrlCount === 0;

  const result = {
    ok: cmp.ok && idempotent && captureComplete && zeroWrongBlocks,
    captureComplete,
    zeroWrongBlocks,
    truncated: !captureComplete,
    elapsedMs: Date.now() - started,
    input: { file: path.basename(input), bytes: fs.statSync(input).size, sha256: await sha256File(input) },
    output: { file: path.basename(once), bytes: fs.statSync(once).size, sha256: onceSha },
    secondPass: { injected: second.injected, reason: second.reason, sha256: twiceSha, byteIdentical: onceSha === twiceSha },
    inject,
    compare: cmp,
    before,
    after
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
  fs.writeFileSync(REPORT_MD, markdown(result));

  console.log(JSON.stringify({
    ok: result.ok,
    captureComplete,
    truncated: result.truncated,
    zeroWrongBlocks,
    elapsedMs: result.elapsedMs,
    before: {
      extinf: before.extinf,
      declaredChannels: before.declaredChannels,
      urls: before.urls,
      streamInf: before.streamInf,
      extattr: before.extattr,
      blocksWithWrongUrlCount: before.blocksWithWrongUrlCount,
      urlSha256: before.urlSha256
    },
    after: {
      extinf: after.extinf,
      urls: after.urls,
      araVersion: after.araVersion,
      araTags: after.araTags,
      blocksWithWrongUrlCount: after.blocksWithWrongUrlCount,
      urlSha256: after.urlSha256
    },
    secondPass: result.secondPass,
    checks: cmp.checks
  }, null, 2));

  if (!result.ok) process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(2);
});
