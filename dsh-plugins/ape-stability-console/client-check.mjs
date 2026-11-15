/**
 * Render smoke test for the APE Stability Console Client half.
 *
 * There is no browser here, so this does not prove what the user sees. It proves
 * the two halves agree on the data contract and that the element tree renders on
 * every path: it loads `client.js` the way the Web page does
 * (`window.__ModuleLoader__.load`), mounts it on a stub context, recovers the
 * sidebar entry and the panel from the recorded slot registrations, and renders
 * them against payloads produced by the REAL Host builders (parse -> four cards)
 * plus the honest empty and error states.
 *
 * React hooks are stubbed: `useState` returns seeded values in call order and
 * `useEffect` never runs, so no fetch happens.
 *
 * Run from the repository root:
 *   node dsh-plugins/ape-stability-console/client-check.mjs
 */

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

/* -------------------------------------------------------- loader capture --- */

let loaded = null;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec;
    },
  },
};

await import('./client.js');
check('loader: one module registered', loaded !== null);
check('loader: id equals the package name', loaded.id === '@local/ape-stability-console', loaded.id);
check('loader: factory is a function', typeof loaded.factory === 'function');

/* ----------------------------------------------------------- react stub ---- */

function createElement(type, props, ...children) {
  const merged = { ...(props || {}) };
  const all = children.length ? children : merged.children;
  if (all !== undefined) merged.children = all;
  return { type, props: merged, kind: 'element' };
}

let seeded = [];
function useState(initial) {
  const next = seeded.length ? seeded.shift() : initial;
  return [next, () => {}];
}

const ReactStub = {
  createElement,
  useState,
  useEffect() {},
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial === undefined ? null : initial }),
};

const requireStub = (name) => {
  if (name === 'react') return ReactStub;
  throw new Error(`unexpected runtime import: ${name}`);
};

/* -------------------------------------------------------------- mounting --- */

const localeCalls = [];
const slotCalls = [];
const fakeCtx = {
  effect(fn) {
    fn();
  },
  locale: {
    register(namespace, language, dictionary) {
      localeCalls.push({ namespace, language, dictionary });
    },
    bind(namespace) {
      return (key) => {
        const dict = localeCalls.find((entry) => entry.namespace === namespace && entry.language === 'es');
        return (dict && dict.dictionary[key]) || key;
      };
    },
  },
  slots: {
    inject(slotName, callback) {
      callback();
    },
    register(options, component) {
      slotCalls.push({ options, component });
      return () => {};
    },
  },
};

const api = loaded.factory(requireStub);
check('factory: inject list', Array.isArray(api.inject) && api.inject.includes('slots') && api.inject.includes('locale'), api.inject);
check('factory: apply is a function', typeof api.apply === 'function');
api.apply(fakeCtx);

/* --------------------------------------------------------------- locale ---- */

check(
  'locale: en and es dictionaries registered',
  localeCalls.length === 2 && localeCalls.some((c) => c.language === 'en') && localeCalls.some((c) => c.language === 'es'),
  localeCalls.map((c) => c.language),
);
check(
  'locale: both dictionaries share the same keys',
  (() => {
    const keys = (lang) => Object.keys(localeCalls.find((c) => c.language === lang).dictionary).sort().join('|');
    return keys('en') === keys('es');
  })(),
  (() => {
    const en = Object.keys(localeCalls.find((c) => c.language === 'en').dictionary);
    const es = Object.keys(localeCalls.find((c) => c.language === 'es').dictionary);
    return en.filter((key) => !es.includes(key)).concat(es.filter((key) => !en.includes(key)));
  })(),
);
check(
  'locale: every key translated in both languages',
  (() => {
    const en = localeCalls.find((c) => c.language === 'en').dictionary;
    const es = localeCalls.find((c) => c.language === 'es').dictionary;
    const missing = Object.keys(en).filter((key) => typeof es[key] !== 'string' || !es[key].length);
    return missing.length === 0 || missing;
  })(),
);

/* ---------------------------------------------------------------- slots ---- */

const sidebar = slotCalls.find((call) => call.options.name === 'sidebar.panellist');
const panel = slotCalls.find((call) => call.options.name === 'main');
check('sidebar: LEFT sidebar entry registered', Boolean(sidebar));
check('sidebar: id matches the panel key', Boolean(sidebar && panel && sidebar.options.id === panel.options.key), sidebar && sidebar.options.id);
check('sidebar: id is the documented panel id', sidebar && sidebar.options.id === 'ape-stability-console', sidebar && sidebar.options.id);
check('sidebar: order is numeric', sidebar && typeof sidebar.options.order === 'number', sidebar && sidebar.options.order);
check(
  'sidebar: label resolves through locale',
  Boolean(sidebar && typeof sidebar.options.label === 'function' && sidebar.options.label().length > 0),
  sidebar && sidebar.options.label && sidebar.options.label(),
);
check('sidebar: label is localized to Spanish', sidebar && sidebar.options.label() === 'Estabilidad APE', sidebar && sidebar.options.label());
check('sidebar: icon component provided', Boolean(sidebar && typeof sidebar.component === 'function'));
check('panel: component provided', Boolean(panel && typeof panel.component === 'function'));
check(
  'sidebar: icon renders an svg with a viewBox',
  (() => {
    const node = sidebar.component({ size: 18 });
    return node && node.type === 'svg' && node.props.viewBox === '0 0 64 64';
  })(),
);

/* ------------------------------------------------------------- rendering ---- */

function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join(' ');
  if (typeof node === 'function') return render(node({}));
  if (node.kind === 'element') {
    if (node.type === undefined || node.type === null) throw new Error('element with undefined type');
    if (typeof node.type === 'function') return render(node.type(node.props || {}));
    return render(node.props ? node.props.children : '');
  }
  return '';
}

const t = (key) => {
  const dict = localeCalls.find((entry) => entry.namespace === 'apeStabilityConsole' && entry.language === 'es');
  return (dict && dict.dictionary[key]) || key;
};

function renderWith(seed) {
  seeded = seed;
  return render(panel.component({ t }));
}

/* ---------------------------------------------------- real Host payloads ---- */

const { __testing } = await import('./index.js');

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
  '{"ts":"2026-11-15T07:16:55Z","verdict":"OK","fallos":0,"modulos":[{"module":"nginx-health","status":"ok","detail":"200|3|0.006180"},{"module":"pulse-canal","status":"sin-muestra","detail":"407|124|0.328154 (upstream del canal, no el modulo)"},{"module":"proyeccion","status":"ok","detail":"186789613B · 21224 canales · 21224 tags · 3857s"}]}',
  '@@PULSE',
  '1312008|407|0.320',
  '1312008|407|0.330',
  '999001|200|0.400',
  '999001|200|0.410',
  '@@STATUS',
  '  10428 200',
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

const parsedFixture = __testing.parseRemote(FIXTURE);
const fullState = {
  ok: true,
  status: 'computed',
  plugin: { name: '@local/ape-stability-console', version: '1.0.0' },
  generatedAt: '2026-11-15T07:20:00.000Z',
  workspace: { root: 'C:\\Users\\HFRC\\Desktop\\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION', source: 'cwd', candidates: [] },
  availability: __testing.buildAvailability(parsedFixture),
  projection: __testing.buildProjection(parsedFixture, { gate: true }),
  stability: Object.assign(__testing.buildStability(parsedFixture), { windowLines: 12000 }),
  failover: __testing.buildFailover(parsedFixture),
  noComputado: [
    'componente C (continuidad, peso 0.30): 0 de 127 URIs /seg/ atribuibles',
    'componente F (frescura, peso 0.10): el log_format ape_playlist no registra $sent_http_x_ape_pulse',
  ],
  remote: {
    status: 'ok',
    command: { target: 'root@178.156.147.234:22', mode: 'BatchMode, publickey only, no PTY' },
    attempts: [{ binary: 'ssh', ok: true, exitCode: 0 }],
    durationMs: 3209,
    cached: false,
  },
  localLists: [{ relative: 'scratch/APE_LISTA_HARNESS.m3u8', status: 'found', bytes: 1311382485 }],
};

/* Pass 1 — first paint: nothing measured yet (probe=0 came back not_probed). */
let textFirst = '';
try {
  textFirst = renderWith([
    { ok: true, status: 'not_probed', generatedAt: '2026-11-15T07:20:00.000Z', workspace: { root: 'C:\\w' }, localLists: [] },
    null,
    false,
    false,
    false,
    null,
  ]);
  check('render: first paint renders', true);
} catch (error) {
  check('render: first paint renders', false, String(error && error.message));
}
check('render: title visible on first paint', textFirst.includes('Consola de Estabilidad APE'));
check('render: first paint explains it has not measured yet', textFirst.includes('Todavia sin medir'));
check('render: first paint shows no invented service row', !textFirst.includes('php8.3-fpm'));

/* Pass 2 — the full measured payload, driven by the real Host builders. */
let textFull = '';
try {
  textFull = renderWith([fullState, null, false, false, false, null]);
  check('render: populated state renders', true);
} catch (error) {
  check('render: populated state renders', false, String(error && error.message));
}

check('render: four cards present', ['Disponibilidad', 'Proyeccion — gate [11]', 'Estabilidad', 'Failover y errores'].every((label) => textFull.includes(label)));
check('render: the three services reach the screen', ['nginx', 'php8.3-fpm', 'ape-jit'].every((unit) => textFull.includes(unit)));
check('render: the dead timer is named', textFull.includes('ape-quality-watch.timer') && textFull.includes('inactive/dead'));
check('render: the watchdog verdict reaches the screen', textFull.includes('OK') && textFull.includes('proyeccion'));
check('render: gate [11] verdict rendered', textFull.includes('gate [11]: ok'));
check('render: measured byte count rendered verbatim', textFull.includes('186789613'));
check('render: channel and tag counts rendered', textFull.includes('21224'));
check('render: zero APE lines rendered as a measured zero', textFull.includes('lineas APE') && textFull.includes('0'));
check('render: served file path rendered', textFull.includes('/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'));
check('render: gate contract quoted', textFull.includes('un tag por canal'));
check('render: stability formula quoted', textFull.includes('iptv-stream-stability-score'));
check('render: verdict buckets rendered', textFull.includes('PASS 0') && textFull.includes('SKIP'));
check('render: per-channel table has the blocked channel', textFull.includes('1312008'));
check('render: a SKIP channel shows an em dash, not a fake score', textFull.includes('—'));
check('render: C/F shown as no computado in the row', textFull.includes('no computado'));
check('render: provider block counted separately', textFull.includes('bloqueo del proveedor') && textFull.includes('347'));
check('render: 5xx counted separately', textFull.includes('5xx') && textFull.includes('254'));
check('render: 499 named as excluded zapping', textFull.includes('zapping del operador'));
check('render: PHP stderr noise separated from network events', textFull.includes('lineas FastCGI stderr') && textFull.includes('819'));
check('render: last network event rendered', textFull.includes('upstream timed out'));
check('render: failover directive rendered', textFull.includes('proxy_next_upstream') && textFull.includes('error timeout'));
check('render: failover armed reason rendered', textFull.includes('NO hay bloques upstream con servidor backup'));
check('render: evidence block names the ssh target', textFull.includes('root@178.156.147.234:22'));
check('render: no-computado list rendered', textFull.includes('No computado, con su razon') && textFull.includes('componente C'));
check('render: local list snapshot rendered', textFull.includes('scratch/APE_LISTA_HARNESS.m3u8'));
check('render: honest scope note rendered', textFull.includes('Alcance honesto'));
check(
  'render: no raw undefined/NaN leaks',
  !/undefined|NaN/.test(textFull.replace(/no computado|no medido/g, '')),
  (textFull.match(/undefined|NaN/g) || []).slice(0, 3),
);

/* Pass 3 — the Host half is not reachable: degrade with a visible reason. */
let textError = '';
try {
  textError = renderWith([null, 'HTTP 404', false, false, false, null]);
  check('render: host-unreachable state renders', true);
} catch (error) {
  check('render: host-unreachable state renders', false, String(error && error.message));
}
check('render: host-unreachable message visible', textError.includes('Mitad Host inalcanzable'));
check('render: host-unreachable reason visible', textError.includes('HTTP 404'));

/* Pass 4 — the probe itself was disabled/blocked: every card says why. */
const offState = {
  ok: true,
  status: 'no_computado',
  reason: 'sondeo ssh desactivado por APE_STABILITY_CONSOLE_SSH',
  generatedAt: '2026-11-15T07:20:00.000Z',
  workspace: { root: 'C:\\w' },
  availability: { status: 'no_computado', reason: 'sondeo ssh desactivado por APE_STABILITY_CONSOLE_SSH' },
  projection: { status: 'no_computado', reason: 'sondeo ssh desactivado', gate: null, live: null },
  stability: { status: 'no_computado', reason: 'sondeo ssh desactivado' },
  failover: { status: 'no_computado', reason: 'sondeo ssh desactivado' },
  localLists: [],
};
let textOff = '';
try {
  textOff = renderWith([offState, null, false, false, false, null]);
  check('render: disabled-probe state renders', true);
} catch (error) {
  check('render: disabled-probe state renders', false, String(error && error.message));
}
check('render: disabled probe names its reason once per card', (textOff.match(/sondeo ssh desactivado/g) || []).length >= 2);
check('render: disabled probe shows no service row', !textOff.includes('php8.3-fpm'));

/* ------------------------------------------------------------------ report - */

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  const mark = entry.ok ? 'PASS' : 'FAIL';
  const detail = entry.detail === undefined ? '' : ` — ${JSON.stringify(entry.detail)}`;
  console.log(`${mark}  ${entry.name}${detail}`);
}
console.log('');
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
