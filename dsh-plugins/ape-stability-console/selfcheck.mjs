/**
 * Reproducible self-check for the APE Stability Console bundle.
 *
 * It installs nothing and touches no Harness surface: it imports the Host half,
 * mounts it on a stub context that records the routes, and drives the pure
 * pipeline (remote script renderer -> section parser -> four card builders ->
 * score formula) with a frozen fixture that mirrors the real VPS output.
 *
 * Run from the repository root:
 *   node dsh-plugins/ape-stability-console/selfcheck.mjs
 *
 * Optional live round (needs the operator ssh key, still read-only):
 *   APE_STABILITY_CONSOLE_LIVE=1 node dsh-plugins/ape-stability-console/selfcheck.mjs
 *
 * Exit code 0 = every check passed. Exit code 1 = at least one failed.
 */

import { __testing } from './index.js';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

/* ------------------------------------------------------------------ mounting */

const routes = [];
const fakeCtx = {
  inject(deps, callback) {
    check('mount: webServer requested', deps.includes('webServer'), deps);
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
  'mount: state route is exact',
  routes.some((route) => route.path === __testing.ROUTE_STATE && route.kind === 'exact'),
);
check(
  'mount: gate route is exact',
  routes.some((route) => route.path === __testing.ROUTE_GATE && route.kind === 'exact'),
);
check('mount: handlers are functions', routes.every((route) => typeof route.handler === 'function'));

/* -------------------------------------------- remote script safety invariants */

const script = __testing.renderRemoteScript({ listFile: __testing.DEFAULTS.listFile, window: 12000 });

check('script: LF only (no CR that would break the remote shell)', !script.includes('\r'));
check('script: starts with set -u', script.startsWith('set -u\n'));
check(
  'script: no state-changing systemctl verb',
  !/systemctl\s+(start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload|kill|set-property)/.test(script),
);
check('script: no redirect into a file', !/>>?\s*\/(etc|var|opt|root|usr|home)/.test(script));
check('script: no rm/mv/cp/tee/dd', !/\b(rm|mv|cp|tee|dd|truncate|sed\s+-i)\s/.test(script));
check('script: no sudo', !/\bsudo\b/.test(script));
check('script: no service restart via nginx -s', !/nginx\s+-s/.test(script));
check(
  'script: only read-only observation commands',
  ['systemctl is-active', 'systemctl list-timers', 'systemctl list-units', 'stat -c%s', 'grep -c', 'tail -n', 'cat /var/lib/ape', 'nginx -T'].every(
    (needle) => script.includes(needle),
  ),
);
check('script: sections delimited', (script.match(/echo "@@/g) || []).length >= 10);
check('script: the list path is substituted', script.includes(__testing.DEFAULTS.listFile) && !script.includes('{list}'));
check('script: the window is substituted', script.includes('W=12000') && !script.includes('{window}'));

// The only variable that reaches the remote script is the list path, and it is
// validated: a traversal or an injection attempt must throw instead of running.
let rejectedTraversal = false;
try {
  __testing.renderRemoteScript({ listFile: '/var/www/../../etc/passwd', window: 12000 });
} catch (error) {
  rejectedTraversal = /no permitida/.test(String(error && error.message));
}
check('script: path traversal in the list path is rejected', rejectedTraversal);

let rejectedInjection = false;
try {
  __testing.renderRemoteScript({ listFile: '/var/www/a"; rm -rf /; #', window: 12000 });
} catch (error) {
  rejectedInjection = /no permitida/.test(String(error && error.message));
}
check('script: shell injection in the list path is rejected', rejectedInjection);

const clampedWindow = __testing.renderRemoteScript({ listFile: '/var/www/x.m3u8', window: 1 });
check('script: an out-of-range window falls back to the default', clampedWindow.includes(`W=${__testing.DEFAULTS.window}`));

/* -------------------------------------------------------- config resolution */

function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

check(
  'config: ssh off disables the probe with a reason',
  withEnv({ [__testing.ENV.ssh]: 'off' }, () => {
    const config = __testing.resolveConfig();
    return !config.enabled && config.problems.some((line) => /desactivado/.test(line));
  }),
);

check(
  'config: a missing key disables the probe with a reason',
  withEnv({ [__testing.ENV.key]: 'C:\\no\\existe\\id_x', [__testing.ENV.ssh]: null }, () => {
    const config = __testing.resolveConfig();
    return !config.enabled && config.problems.some((line) => /clave privada no existe/.test(line));
  }),
);

check(
  'config: a host with an ssh option is rejected',
  withEnv({ [__testing.ENV.host]: '-oProxyCommand=calc.exe' }, () => {
    const config = __testing.resolveConfig();
    return !config.enabled && config.problems.some((line) => /host invalido/.test(line));
  }),
);

check(
  'config: an invalid user is rejected',
  withEnv({ [__testing.ENV.user]: 'root; rm -rf /' }, () => {
    const config = __testing.resolveConfig();
    return !config.enabled && config.problems.some((line) => /usuario invalido/.test(line));
  }),
);

check(
  'config: an invalid port is rejected',
  withEnv({ [__testing.ENV.port]: '22 -oProxyCommand=x' }, () => {
    const config = __testing.resolveConfig();
    return !config.enabled && config.problems.some((line) => /puerto invalido/.test(line));
  }),
);

/* -------------------------------------------------------------- parse fixture */

/** Frozen shape of the real remote output (values are the code paths, not data). */
const FIXTURE = [
  '@@SVC',
  'nginx|active',
  'php8.3-fpm|active',
  'ape-jit|active',
  '@@TIMERS',
  'ape-cablear-auto.timer',
  'ape-cablear-cola.timer',
  'ape-quality-watch.timer',
  '@@TUNIT',
  'ape-cablear-auto.timer|active|waiting',
  'ape-cablear-cola.timer|active|waiting',
  'ape-quality-watch.timer|inactive|dead',
  '@@PROJ',
  '186789613|21224|21224|0|3659|/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8',
  '@@WDJ',
  '{"ts":"2026-11-15T07:16:55Z","verdict":"OK","fallos":0,"modulos":[{"module":"proyeccion","status":"ok","detail":"186789613B · 21224 canales · 21224 tags · 3857s"},{"module":"pulse-canal","status":"sin-muestra","detail":"407|124|0.328154"}]}',
  '@@PULSE',
  '1312008|407|0.320',
  '1312008|407|0.330',
  '999001|200|0.400',
  '999001|200|0.410',
  '@@STATUS',
  '  10428 200',
  '    338 302',
  '    347 407',
  '    254 503',
  '     24 499',
  '@@SEG',
  '129|127|0|http://185.102.171.19:80/hls/abc/548065_827.ts',
  '@@ERRCLASS',
  'upstream_timed_out|2',
  'upstream_prematurely_closed|2',
  'no_live_upstreams|0',
  'connect_failed|0',
  'fastcgi_stderr|819',
  'ssl_handshake|0',
  'recv_failed|4',
  'total_error|1018',
  'total_warn|113',
  '@@ERRL',
  '2026/11/15 06:50:37 [error] 1789135#1789135: *6 upstream timed out (110: Connection timed out) while reading upstream',
  '@@FAILOVER',
  '1',
  'proxy_next_upstream     error timeout;',
  '0',
  '0',
  '0',
  '@@END',
].join('\n');

const parsed = __testing.parseRemote(FIXTURE);
check('parse: every section present', parsed.complete && parsed.missingSections.length === 0, parsed.missingSections);
check('parse: services read', parsed.services.length === 3 && parsed.services.every((row) => row.state === 'active'));
check('parse: timers listed', parsed.timers.length === 3, parsed.timers);
check('parse: dead timer detected', parsed.timerUnits.filter((row) => row.active !== 'active').length === 1);
check(
  'parse: projection numbers read exactly',
  parsed.projection.bytes === 186789613 && parsed.projection.channels === 21224 &&
    parsed.projection.tags === 21224 && parsed.projection.apeLines === 0,
  parsed.projection,
);
check('parse: watchdog JSON parsed', parsed.watchdog.status === 'found' && parsed.watchdog.document.verdict === 'OK');
check('parse: pulse rows read', parsed.pulse.length === 4 && parsed.pulse[0].channel === '1312008', parsed.pulse);
check('parse: access histogram read', parsed.statusHistogram.length === 5 && parsed.statusHistogram[0].count === 10428);
check('parse: segment attribution read', parsed.segments.attributable === 0 && parsed.segments.decoded === 127);
check(
  'parse: error classes read exactly (no stray bare counter line)',
  parsed.errorClasses.length === 9 && parsed.errorClasses.find((row) => row.name === 'total_error').count === 1018,
  parsed.errorClasses,
);
check(
  'parse: failover directives are not mistaken for counts',
  parsed.failover.nextUpstreamCount === 1 &&
    parsed.failover.nextUpstreamDirectives.length === 1 &&
    parsed.failover.upstreamBlocks === 0 &&
    parsed.failover.backupServers === 0,
  parsed.failover,
);
check('parse: END sentinel detected', parsed.sections.includes('END'));

const truncated = __testing.parseRemote('@@SVC\nnginx|active\n@@PROJ\n1|2|2|0|1|/x');
check(
  'parse: a truncated response is reported, not silently accepted',
  !truncated.complete && truncated.missingSections.includes('END'),
  truncated.missingSections,
);

/* ------------------------------------------------------------ score formula */

const attribution = { possible: false, reason: 'test: no atribuible' };
const freshness = { possible: false, reason: 'test: sin X-APE-Pulse' };
const ctx = { segmentAttribution: attribution, freshness };

function rows(status, count, rt) {
  return Array.from({ length: count }, () => ({ channel: 'c', status, rt }));
}

const healthy = __testing.scoreChannel('c', rows(200, 40, 0.5), ctx);
check('score: healthy channel -> A=1, L=1', healthy.A === 1 && healthy.L === 1, { A: healthy.A, L: healthy.L });
check('score: healthy channel PASSes', healthy.veredicto === 'PASS', healthy.veredicto);
check(
  'score: PASS score renormalises over A+L (0.6 of weight)',
  healthy.score === 100 && healthy.confianza === 'parcial' && healthy.componentes.join(',') === 'A,L',
  { score: healthy.score, confianza: healthy.confianza },
);

const slow = __testing.scoreChannel('c', rows(200, 40, 1.947), ctx);
check('score: 3x the p50 baseline drives L to 0', slow.L === 0, slow.L);
check('score: A=1 L=0 -> 66.7 on the present weights', slow.score === 66.7, slow.score);

const broken = __testing.scoreChannel('c', [...rows(200, 10, 0.5), ...rows(502, 30, 0.5)], ctx);
check('score: 5xx lowers A', broken.A !== null && broken.A < 0.3, broken.A);
check('score: heavy 5xx FAILs', broken.veredicto === 'FAIL', broken.veredicto);

const blocked = __testing.scoreChannel('c', rows(407, 40, 0.3), ctx);
check('score: provider blocking is a flag, not a network failure', blocked.bloqueoProveedor === 40 && blocked.serverErrors === 0);
check('score: >50% provider blocking is SKIP with its reason', blocked.veredicto === 'SKIP' && /proveedor/.test(blocked.veredictoRazon), blocked.veredictoRazon);
check('score: a SKIP carries no score', blocked.score === null, blocked.score);

const aborted = __testing.scoreChannel('c', rows(499, 40, 12), ctx);
check('score: 499 stays out of the availability denominator', aborted.A === null && aborted.excluded === 40, aborted.A);
check('score: an aborted-only channel is SKIP, never a zero', aborted.veredicto === 'SKIP' && aborted.score === null);

const thin = __testing.scoreChannel('c', rows(200, 5, 0.5), ctx);
check('score: n<30 is SKIP, not a zero', thin.veredicto === 'SKIP' && thin.score === null, thin.n);

const grey = __testing.scoreChannel('c', [...rows(200, 38, 0.5), ...rows(503, 2, 0.5)], ctx);
check(
  'score: the 0.90-0.98 band is named SIN_VEREDICTO instead of invented',
  grey.veredicto === 'SIN_VEREDICTO' && /banda intermedia/.test(grey.veredictoRazon),
  { A: grey.A, verdict: grey.veredicto },
);
check('score: the grey band still reports its score', typeof grey.score === 'number', grey.score);

check(
  'score: every missing component is named, the computed ones are not',
  ['C', 'F'].every((name) => healthy.noComputado.some((line) => line.startsWith(`${name}:`))) &&
    !healthy.noComputado.some((line) => line.startsWith('A:')),
  healthy.noComputado,
);
check(
  'score: a channel with no usable 200 names A as missing',
  __testing.scoreChannel('c', rows(499, 40, 12), ctx).noComputado.some((line) => line.startsWith('A:')),
);

/* ---------------------------------------------------------------- builders */

const availability = __testing.buildAvailability(parsed);
check('availability: three services, all active', availability.services.length === 3 && availability.servicesOk === 3);
check('availability: dead timer surfaced', availability.timers.deadTimers.length === 1, availability.timers.deadTimers);
check('availability: watchdog modules surfaced', availability.watchdog.modules.length === 2);

const projection = __testing.buildProjection(parsed, { gate: true });
check('projection: gate row read from the watchdog', projection.gate.status === 'computed' && projection.gate.verdict === 'ok');
check(
  'projection: live recount is consistent',
  projection.live.status === 'computed' && projection.live.consistent === true,
  projection.live,
);

const projectionSkipped = __testing.buildProjection(parsed, { gate: false });
check(
  'projection: skipping the recount is declared, not faked',
  projectionSkipped.live.status === 'not_measured' && typeof projectionSkipped.live.reason === 'string',
  projectionSkipped.live.status,
);

const inconsistent = __testing.buildProjection(
  { ...parsed, projection: { status: 'measured', bytes: 1, channels: 10, tags: 9, apeLines: 4, ageSeconds: 1, path: '/x' } },
  { gate: true },
);
check(
  'projection: one tag per channel enforced (gate contract)',
  inconsistent.live.consistent === false && inconsistent.live.verdict === 'fail',
);

const stability = __testing.buildStability(parsed);
check('stability: channels counted', stability.channels === 2 && stability.totalPulseSamples === 4, stability.channels);
check('stability: verdict buckets present', ['PASS', 'FAIL', 'SKIP', 'SIN_VEREDICTO'].every((key) => key in stability.verdicts));
check('stability: C declared NO COMPUTADO with the measured reason', /0 de 127/.test(stability.attribution.reason), stability.attribution.reason);
check('stability: F declared NO COMPUTADO with the measured reason', /x_ape_pulse/.test(stability.freshness.reason));

const failover = __testing.buildFailover(parsed);
check(
  'failover: provider blocking is separated from 5xx',
  failover.accessWindow.providerBlock === 347 && failover.accessWindow.serverErrors === 254,
  failover.accessWindow,
);
check('failover: 499 reported as excluded', failover.accessWindow.excluded === 24);
check(
  'failover: network events counted without the PHP stderr noise',
  failover.errorLog.networkEvents === 8 && failover.errorLog.fastcgiStderr === 819,
  { net: failover.errorLog.networkEvents, fastcgi: failover.errorLog.fastcgiStderr },
);
check(
  'failover: armed but without a backend backup',
  failover.failoverArmed.armed === true && failover.failoverArmed.multiBackend === false,
  failover.failoverArmed,
);
check('failover: last network line kept', failover.lastNetworkLines.length === 1);

/* ---------------------------------------------------------- state, no probe */

const notProbed = await __testing.buildState({ probe: false });
check('state: first paint does not probe', notProbed.status === 'not_probed' && notProbed.availability === null);
check('state: first paint still resolves the workspace', typeof notProbed.workspace.root === 'string' && notProbed.workspace.root.length > 0);
check('state: first paint reports local list snapshots', Array.isArray(notProbed.localLists) && notProbed.localLists.length >= 1);

const disabled = await withEnv({ [__testing.ENV.ssh]: 'off' }, () => __testing.buildState({ probe: true }));
check(
  'state: a disabled probe is no_computado with the reason on all four cards',
  disabled.status === 'no_computado' &&
    disabled.availability.status === 'no_computado' &&
    disabled.stability.status === 'no_computado' &&
    disabled.failover.status === 'no_computado' &&
    disabled.projection.status === 'no_computado',
  disabled.reason,
);
check('state: no card invents data when the probe is off', disabled.availability.services === undefined);

/* --------------------------------------------------------- optional live run */

if (['1', 'true', 'yes'].includes(String(process.env.APE_STABILITY_CONSOLE_LIVE || '').toLowerCase())) {
  const live = await __testing.buildState({ probe: true, gate: true, refresh: true });
  check('live: probe reached the VPS', live.status === 'computed', live.status === 'computed' ? null : live.reason);
  if (live.status === 'computed') {
    check('live: three services reported', live.availability.services.length === 3, live.availability.services);
    check('live: timers counted', live.availability.timers.count > 0, live.availability.timers.count);
    check('live: projection gate measured', live.projection.gate.status === 'computed');
    check('live: projection recount consistent', live.projection.live.consistent === true, live.projection.live.check);
    check('live: stability computed', live.stability.status === 'computed', live.stability.channels);
    check('live: failover computed', live.failover.status === 'computed');
    check(
      'live: the served list is the operator number (186789613 B)',
      live.projection.live.bytes === 186789613,
      live.projection.live.bytes,
    );
  }
}

/* -------------------------------------------------------------------- report */

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  const mark = entry.ok ? 'PASS' : 'FAIL';
  const detail = entry.detail === undefined ? '' : ` — ${JSON.stringify(entry.detail)}`;
  console.log(`${mark}  ${entry.name}${detail}`);
}

console.log('');
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
console.log(`live round: ${['1', 'true', 'yes'].includes(String(process.env.APE_STABILITY_CONSOLE_LIVE || '').toLowerCase()) ? 'executed' : 'skipped (set APE_STABILITY_CONSOLE_LIVE=1)'}`);

// `process.exit()` with an ssh child or a socket still closing trips a libuv
// assertion on Windows, so the process leaves through the exit code instead.
process.exitCode = failed.length === 0 ? 0 : 1;
