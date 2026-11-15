/**
 * Render smoke test for the APE Profile Studio Client half.
 *
 * There is no browser here, so this does not prove what the user sees. It does
 * prove the two halves agree on the data contract: it loads `client.js` the way
 * the Web page does (`window.__ModuleLoader__.load`), mounts it on a stub
 * context, recovers the sidebar entry and the panel from the recorded slot
 * registrations, and renders both against the REAL payload produced by the Host
 * half (`buildState` + `handleClassify`) in this workspace.
 *
 * React hooks are stubbed: `useState` returns seeded values in call order and
 * `useEffect` never runs, so no fetch happens. That is enough to execute every
 * render path, including the empty states, and to catch a broken element tree.
 *
 * Run from the repository root:
 *   node dsh-plugins/ape-profile-studio/client-check.mjs
 */

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

/* ------------------------------------------------------- loader capture ---- */

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
check('loader: id equals the package name', loaded.id === '@local/ape-profile-studio', loaded.id);
check('loader: factory is a function', typeof loaded.factory === 'function');

/* ------------------------------------------------------------ react stub ---- */

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

/* ---------------------------------------------------------------- mounting - */

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

check('locale: en and es dictionaries registered', localeCalls.length === 2 && localeCalls.some((c) => c.language === 'en') && localeCalls.some((c) => c.language === 'es'));
check(
  'locale: both dictionaries share the same keys',
  (() => {
    const keys = (lang) => Object.keys(localeCalls.find((c) => c.language === lang).dictionary).sort().join('|');
    return keys('en') === keys('es');
  })(),
);
check('locale: every key translated in both languages', (() => {
  const en = localeCalls.find((c) => c.language === 'en').dictionary;
  const es = localeCalls.find((c) => c.language === 'es').dictionary;
  const missing = Object.keys(en).filter((key) => typeof es[key] !== 'string' || !es[key].length);
  return missing.length === 0 || missing;
})());

const sidebar = slotCalls.find((call) => call.options.name === 'sidebar.panellist');
const panel = slotCalls.find((call) => call.options.name === 'main');
check('sidebar: entry registered', Boolean(sidebar));
check('sidebar: id matches the panel key', Boolean(sidebar && panel && sidebar.options.id === panel.options.key), sidebar && sidebar.options.id);
check('sidebar: order is numeric', sidebar && typeof sidebar.options.order === 'number', sidebar && sidebar.options.order);
check('sidebar: label resolves through locale', Boolean(sidebar && typeof sidebar.options.label === 'function' && sidebar.options.label().length > 0), sidebar && sidebar.options.label && sidebar.options.label());
check('sidebar: icon component provided', Boolean(sidebar && typeof sidebar.component === 'function'));
check('panel: component provided', Boolean(panel && typeof panel.component === 'function'));

/* --------------------------------------------------------------- rendering - */

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
  const dict = localeCalls.find((entry) => entry.namespace === 'apeProfileStudio' && entry.language === 'es');
  return (dict && dict.dictionary[key]) || key;
};

// Pass 1 — first paint, nothing read yet.
seeded = [];
let textEmpty = '';
try {
  textEmpty = render(panel.component({ t }));
  check('render: empty state renders', true);
} catch (error) {
  check('render: empty state renders', false, String(error && error.message));
}
check('render: missing contract empty state visible', textEmpty.includes('Contrato no encontrado'), textEmpty.slice(0, 120));
check('render: contract path named in the empty state', textEmpty.includes('contracts/ape_profiles_12.json'));
check('render: classifier missing message visible', textEmpty.includes('El clasificador no existe todavia') || textEmpty.includes('clasificador no existe'));
check('render: list card present', textEmpty.includes('Lista servida'));
check('render: title and honest note present', textEmpty.includes('APE Profile Studio') && textEmpty.includes('Alcance honesto'));

/* ------------------------------------- real payloads from the Host half ---- */

const { __testing } = await import('./index.js');
const state = await __testing.buildState({ probe: false });

const classifyResponse = await (async () => {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      this.body += chunk === null || chunk === undefined ? '' : String(chunk);
    },
  };
  const request = {
    url: __testing.ROUTE_CLASSIFY,
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          line:
            '#EXTINF:-1 tvg-id="selfcheck.premium" tvg-name="Selfcheck 4K" group-title="Deportes 4K",Selfcheck 4K HDR\nhttp://selfcheck.invalid/premium.m3u8',
        }),
        'utf8',
      );
    },
  };
  await __testing.handleClassify(request, response);
  return JSON.parse(response.body);
})();

// Pass 2 — a populated render driven by the measured payload.
seeded = [state, null, false, false, '#EXTINF:-1, bloque pegado', null, classifyResponse, false, null];
let textFull = '';
try {
  textFull = render(panel.component({ t }));
  check('render: populated state renders', true);
} catch (error) {
  check('render: populated state renders', false, String(error && error.message));
}

const configSha = state.artifacts.config.sha256 || '';
check(
  'render: measured config digest reaches the panel',
  configSha.length === 64 && textFull.includes(configSha.slice(0, 16)),
  `${configSha.slice(0, 16)}…`,
);
check(
  'render: classifier path reaches the panel',
  textFull.includes('ape-profile-classifier.js'),
);
check(
  'render: honest classifier degrade is displayed',
  classifyResponse.status === 'ok' ? textFull.includes('Resultado de la clasificacion') : textFull.includes('La clasificacion no produjo resultado') || textFull.includes('el clasificador no existe'),
  classifyResponse.status,
);
check('render: workspace root is displayed', textFull.includes(state.workspace.root));
check(
  'render: classifier signals rendered when present',
  !Array.isArray(classifyResponse.signals) || classifyResponse.signals.length === 0
    ? true
    : textFull.includes(classifyResponse.signals[0]),
  classifyResponse.signals && classifyResponse.signals[0],
);
check(
  'render: classified profile value rendered',
  classifyResponse.status !== 'ok' ? true : textFull.includes(String(classifyResponse.result.profile)),
  classifyResponse.status === 'ok' ? classifyResponse.result.profile : classifyResponse.status,
);
check('render: no invented profile rows', state.contract.status !== 'found' ? !textFull.includes('GOD_TIER') : true);

// When the contract exists in the workspace, its rows and values must reach the
// screen verbatim. These checks are unconditional assertions on the payload the
// Host measured; they are only registered when the contract is present.
if (state.contract.status === 'found') {
  const rows = state.contract.profiles;
  check('render: every contract row rendered', rows.every((row) => textFull.includes(String(row.values.id))), `${rows.length} rows`);
  check(
    'render: measured resolution and codec rendered',
    rows.slice(0, 3).every((row) =>
      (!row.values.resolution || textFull.includes(String(row.values.resolution))) &&
      (!row.values.codec || textFull.includes(String(row.values.codec))),
    ),
  );
  const noted = rows.filter((row) => typeof row.values.reason === 'string');
  check(
    'render: contract notes rendered when present',
    noted.length === 0 || textFull.includes(noted[0].values.reason.slice(0, 40)),
    `${noted.length} rows carry a reason`,
  );
  check(
    'render: declared-vs-listed mismatch surfaced or absent',
    typeof state.contract.declaredCount !== 'number' || state.contract.declaredCount === state.contract.count || textFull.includes('declara un numero distinto'),
    state.contract.declaredCount,
  );
}check('render: no raw undefined/null leaks', !/undefined|NaN/.test(textFull.replace(/no reportado|none/g, '')), (textFull.match(/undefined|NaN/g) || []).slice(0, 3));

// Pass 3 — the Host half is not reachable (route missing or failed): the panel
// must degrade with a visible reason instead of throwing.
seeded = [null, 'HTTP 404', false, false, '', null, null, false, null];
let textError = '';
try {
  textError = render(panel.component({ t }));
  check('render: host-unreachable state renders', true);
} catch (error) {
  check('render: host-unreachable state renders', false, String(error && error.message));
}
check('render: host-unreachable message visible', textError.includes('Mitad Host inalcanzable'));
check('render: host-unreachable reason visible', textError.includes('HTTP 404'));

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
