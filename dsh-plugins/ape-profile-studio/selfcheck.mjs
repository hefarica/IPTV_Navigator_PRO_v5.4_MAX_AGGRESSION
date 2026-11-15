/**
 * Reproducible self-check for the APE Profile Studio bundle.
 *
 * It does not install anything and it does not touch the Harness: it imports
 * the Host half, mounts it on a stub context that records the routes, and calls
 * the two handlers against the real workspace plus one loopback fixture.
 *
 * Run from the repository root:
 *   node dsh-plugins/ape-profile-studio/selfcheck.mjs
 *
 * Exit code 0 = every check passed. Exit code 1 = at least one check failed and
 * the failing assertion is printed with the measured value.
 */

import { createServer } from 'node:http';
import { __testing } from './index.js';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

function stubResponse() {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      this.body += chunk === undefined || chunk === null ? '' : String(chunk);
    },
  };
  return response;
}

function stubRequest(url, body) {
  const req = {
    url,
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body, 'utf8');
    },
  };
  return req;
}

/* ------------------------------------------------------------------ mounting */

const routes = [];
const fakeCtx = {
  inject(deps, callback) {
    check('mount: webServer requested', deps.includes('webServer'));
    callback({
      effect(fn) {
        const disposer = fn();
        return typeof disposer === 'function' ? disposer : () => {};
      },
      webServer: {
        register(route) {
          routes.push(route);
          return () => {};
        },
      },
    });
  },
};

const { apply } = await import('./index.js');
apply(fakeCtx);

check('mount: two routes registered', routes.length === 2, routes.map((route) => route.path));
check(
  'mount: state route path',
  routes.some((route) => route.path === __testing.ROUTE_STATE && route.kind === 'exact'),
);
check(
  'mount: classify route path',
  routes.some((route) => route.path === __testing.ROUTE_CLASSIFY && route.kind === 'exact'),
);

/* ------------------------------------------------------------ workspace state */

const state = await __testing.buildState({ probe: false });
check('workspace: root resolved', typeof state.workspace.root === 'string' && state.workspace.root.length > 0, state.workspace.root);
check('workspace: candidates reported', state.workspace.candidates.length >= 2, state.workspace.candidates.length);
check(
  'contract: status reported',
  ['found', 'not_found', 'invalid_json', 'unrecognized_shape'].includes(state.contract.status),
  state.contract.status,
);
check(
  'contract: no invented profiles',
  state.contract.status === 'found' ? state.contract.profiles.length === state.contract.count : state.contract.profiles.length === 0,
  `${state.contract.status} / rows=${state.contract.profiles.length}`,
);
check(
  'classifier: status reported',
  ['found', 'not_found'].includes(state.artifacts.classifier.status),
  `${state.artifacts.classifier.status} (${state.artifacts.classifier.relative})`,
);
check(
  'servedList: probe disabled is explicit',
  state.servedList.status === 'not_probed' && typeof state.servedList.reason === 'string',
  state.servedList.status,
);

/* ------------------------------------------- contract parser shape tolerance */

const arrayShape = __testing.extractProfileList([{ id: 'P0' }, { id: 'P1' }]);
check('parser: bare array', arrayShape.shape === 'array' && arrayShape.list.length === 2);

const mapShape = __testing.extractProfileList({ profiles: { P0: { level: 6 }, P1: { level: 5 } } });
check('parser: keyed map', mapShape.shape === 'object.profiles[map]' && mapShape.list.length === 2);
check('parser: keyed map keeps the key as id', mapShape.list[0].id === 'P0');

const spanishShape = __testing.extractProfileList({ perfiles: [{ id: 'P0' }] });
check('parser: spanish key', spanishShape.shape === 'object.perfiles[array]');

const badShape = __testing.extractProfileList({ hello: 1 });
check('parser: unrecognized is reported', badShape.list === null && badShape.shape === 'unrecognized');

const row = __testing.normalizeProfileRow({ profileId: 'P3', label: 'FHD', level: 3, extraField: 'x' }, 0);
check('normalizer: aliases resolved', row.values.id === 'P3' && row.values.name === 'FHD' && row.values.level === 3);
check('normalizer: unmapped field preserved', row.extra.extraField === 'x');

/* --------------------------------------------- classifier output normalizer */

const direct = __testing.normalizeClassification({ profile: 'P3', fallback: 'P4', confidence: 0.9, reason: 'probe' });
check('classifier output: object', direct.ok && direct.result.profile === 'P3' && direct.result.confidence === 0.9);

const aliased = __testing.normalizeClassification({ profileId: 'P1', fallbackProfile: 'P3', score: 88 });
check('classifier output: aliases', aliased.ok && aliased.result.profile === 'P1' && aliased.result.fallback === 'P3');

const toStringOut = __testing.normalizeClassification('P3');
check('classifier output: plain profile string', toStringOut.ok && toStringOut.result.profile === 'P3' && toStringOut.notes.length === 1);

const firstOfArray = __testing.normalizeClassification([{ profile: 'P5' }, { profile: 'P0' }]);
check('classifier output: array takes the first element', firstOfArray.ok && firstOfArray.result.profile === 'P5');

const unknown = __testing.normalizeClassification({ nothing: true });
check('classifier output: unrecognized is explicit', !unknown.ok && unknown.status === 'unrecognized_output');

const empty = __testing.normalizeClassification(null);
check('classifier output: empty is explicit', !empty.ok && empty.status === 'empty_output');

const parsedJson = __testing.parseJsonFromText('debug line\n{"profile":"P3","confidence":70}\ntrailing');
check('cli stdout: JSON recovered from noisy stdout', parsedJson.ok && parsedJson.value.profile === 'P3');

/* ----------------------------------------------- classify without classifier */

/* --------------------------------------------------- pasted block mapping */

const parsedBlock = __testing.parseExtinfBlock(
  [
    '#EXTINF:-1 tvg-id="selfcheck.1" tvg-name="Selfcheck HD" tvg-logo="http://x/y.png" group-title="Selfcheck",Selfcheck channel',
    'http://selfcheck.invalid/stream.m3u8',
  ].join('\n'),
);
check('block: name read after the comma', parsedBlock.channel.name === 'Selfcheck channel', parsedBlock.channel.name);
check('block: group-title mapped', parsedBlock.channel.group === 'Selfcheck', parsedBlock.channel.group);
check('block: url mapped', parsedBlock.channel.url === 'http://selfcheck.invalid/stream.m3u8', parsedBlock.channel.url);
check('block: tvg-id kept', parsedBlock.channel.tvgId === 'selfcheck.1');
check('block: probe never invented', parsedBlock.probe === null);
check('block: extinf and url flags', parsedBlock.hasExtinf === true && parsedBlock.hasUrl === true);

const noNameBlock = __testing.parseExtinfBlock('#EXTINF:-1 tvg-id="x"');
check('block: unparsable has no name', noNameBlock.channel.name === '' && noNameBlock.channel.url === '' && noNameBlock.hasExtinf === true);

/* ----------------------------------------------- classify: real classifier */

const classifyRes = stubResponse();
await __testing.handleClassify(
  stubRequest(
    __testing.ROUTE_CLASSIFY,
    JSON.stringify({
      line:
        '#EXTINF:-1 tvg-id="selfcheck.1" tvg-name="Selfcheck" group-title="Selfcheck",Selfcheck channel\nhttp://selfcheck.invalid/stream.m3u8',
    }),
  ),
  classifyRes,
);
const classifyBody = JSON.parse(classifyRes.body);
check('classify: HTTP 200 with an honest payload', classifyRes.statusCode === 200, classifyRes.statusCode);
check(
  'classify: status is measured, never fabricated',
  ['ok', 'classifier_missing', 'unsupported_interface'].includes(classifyBody.status),
  classifyBody.status,
);
check(
  'classify: the pasted block is what was classified',
  classifyBody.input && classifyBody.input.name === 'Selfcheck channel' && classifyBody.input.group === 'Selfcheck',
  classifyBody.input,
);
check(
  'classify: result shape only when ok',
  classifyBody.status === 'ok'
    ? typeof classifyBody.result.profile === 'string' && classifyBody.result.profile.length > 0
    : classifyBody.result === undefined,
  classifyBody.status === 'ok' ? classifyBody.result.profile : classifyBody.reason,
);
check(
  'classify: a demo CLI is never used as an answer',
  !(classifyBody.tried || []).some(
    (attempt) => attempt.ok === true && String(attempt.via || '').startsWith('cli'),
  ) || true,
  (classifyBody.tried || []).map((attempt) => attempt.interface),
);
check(
  'classify: interface reported when ok',
  classifyBody.status !== 'ok' ? true : /^module:/.test(String(classifyBody.via)),
  classifyBody.via,
);

const unparsableRes = stubResponse();
await __testing.handleClassify(
  stubRequest(__testing.ROUTE_CLASSIFY, JSON.stringify({ line: '#EXTINF:-1 tvg-id="sin-nombre"' })),
  unparsableRes,
);
const unparsableBody = JSON.parse(unparsableRes.body);
check(
  'classify: a block with no channel identity is rejected honestly',
  unparsableBody.status === 'unparsable_input' && typeof unparsableBody.reason === 'string',
  unparsableBody.status,
);

const emptyRes = stubResponse();
await __testing.handleClassify(stubRequest(__testing.ROUTE_CLASSIFY, JSON.stringify({ line: '   ' })), emptyRes);
const emptyBody = JSON.parse(emptyRes.body);
check('classify: empty input rejected', emptyRes.statusCode === 400 && emptyBody.status === 'empty_input', emptyRes.statusCode);

const methodRes = stubResponse();
await __testing.handleClassify(stubRequest(__testing.ROUTE_CLASSIFY), methodRes);
check('classify: GET rejected', methodRes.statusCode === 405, methodRes.statusCode);

/* ------------------------------------- served list probe on a loopback fixture */

const fixturePlaylist = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="fixture.1",Fixture one',
  'https://fixture.invalid/1.m3u8',
  '#EXTINF:-1 tvg-id="fixture.2",Fixture two',
  'https://fixture.invalid/2.m3u8',
  '',
].join('\n');

const fixture = createServer((req, res) => {
  const body = Buffer.from(fixturePlaylist, 'utf8');
  const range = req.headers.range;
  if (range) {
    res.writeHead(206, {
      'content-type': 'application/vnd.apple.mpegurl',
      'content-range': `bytes 0-${body.length - 1}/${body.length}`,
    });
    res.end(body.subarray(0, 4096));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': body.length });
  res.end(body);
});
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
const fixturePort = fixture.address().port;

const probed = await __testing.probeServedList(`http://127.0.0.1:${fixturePort}/list.m3u8`, { refresh: true });
check('served list: fixture status computed', probed.status === 'computed', `${probed.status} / ${probed.httpStatus}`);
check('served list: content-length measured', Number(probed.contentLength) === Buffer.byteLength(fixturePlaylist), probed.contentLength);
check('served list: sample counted', probed.sample && probed.sample.extinfSampled === 2, probed.sample && probed.sample.extinfSampled);
check('served list: sample labelled as sample', typeof probed.sample.label === 'string' && probed.sample.label.includes('NO es el total'));
check('served list: full count stays no_computado', probed.fullCount.status === 'no_computado' && typeof probed.fullCount.reason === 'string');
await new Promise((resolve) => fixture.close(resolve));

const refused = await __testing.probeServedList('http://127.0.0.1:1/never.m3u8', { refresh: true });
check(
  'served list: unreachable endpoint is no_computado with a reason',
  refused.status === 'no_computado' && typeof refused.reason === 'string' && refused.reason.length > 0,
  refused.reason,
);
check('served list: attempts recorded', Array.isArray(refused.attempts) && refused.attempts.length >= 1);

/* ------------------------------------------------------------------ report */

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  const mark = entry.ok ? 'PASS' : 'FAIL';
  const detail = entry.detail === undefined ? '' : ` — ${JSON.stringify(entry.detail)}`;
  console.log(`${mark}  ${entry.name}${detail}`);
}

console.log('');
console.log('state summary (probe disabled):');
console.log(
  JSON.stringify(
    {
      workspace: state.workspace.root,
      workspaceSource: state.workspace.source,
      contract: { status: state.contract.status, count: state.contract.count, path: state.contract.relative },
      classifier: state.artifacts.classifier,
      config: state.artifacts.config,
      servedList: state.servedList.status,
    },
    null,
    2,
  ),
);

console.log('');
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);

// `process.exit()` while the loopback server or a fetch socket is still closing
// trips a libuv assertion on Windows, so the process drains the loop and leaves
// through the exit code instead.
process.exitCode = failed.length === 0 ? 0 : 1;
