#!/usr/bin/env node
'use strict';

/**
 * Real-browser regression for the existing Connection / Analysis / Filters UI.
 *
 * Loads the COMPLETE, unmodified index-v4.html and application scripts. Uses
 * Chromium's real DOM, IndexedDB, workers and HTTP. The only provider data are
 * explicit synthetic fixtures served by this test on ephemeral loopback ports;
 * these are not playable channels, production credentials or QoE measurements.
 * No application method, network implementation or database implementation is
 * replaced. All network origins except these test servers are aborted.
 *
 * Run from any directory:
 *   node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/tabs-contract-browser.test.cjs
 * Optional: CHROMIUM_PATH / CHROME_PATH, APE_TABS_QA_DIR,
 * APE_TABS_BASELINE_REF (default HEAD; CI should pass the change's base SHA).
 * --preflight checks source syntax and unchanged tab markup without opening
 * sockets or launching a browser. Its receipt explicitly says UI was not run.
 * --serve-only serves the same frontend plus fixtures for an authorized browser
 * already available through computer-use tools; it never starts Chromium.
 * Exit 2 means the browser/dependency is unavailable, never a successful test.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const REPO = path.resolve(FRONTEND, '../..');
const HTML_PATH = path.join(FRONTEND, 'index-v4.html');
const OUTPUT = process.env.APE_TABS_QA_DIR || path.join(os.tmpdir(), 'ape-tabs-browser-qa');
const CHROME = process.env.CHROMIUM_PATH || process.env.CHROME_PATH || '/usr/bin/chromium';
const BASELINE = process.env.APE_TABS_BASELINE_REF || 'HEAD';
const COLUMNS = ['id', 'name', 'group', 'language', 'codec', 'resolution', 'qualityScore', 'serverName'];
// Existing base behavior: a successful connection runs APEChannelClassifier and
// _ensureClassificationFields() appends these four display columns. The patch
// does not touch that path; it is asserted so a future change cannot hide it.
const CLASSIFICATION_COLUMNS = ['_region', '_language', '_category', '_quality'];

const report = {
  test: 'tabs-contract-browser',
  startedAt: new Date().toISOString(),
  scope: 'Real application UI, local HTTP fixture ingestion and IndexedDB persistence; no playback/QoE claim.',
  fixtures: { declaredSynthetic: true, providerA: 130, providerB: 10, overlappingStreamIds: true, sharedTvgId: 'fixture-shared-station' },
  uiAssertionsExecuted: false,
  uiSuiteCompleted: false,
  checks: [], screenshots: [], pageErrors: [], consoleCounts: {},
  externalRequestsBlocked: 0, allowedNetworkOrigins: [], providerRequests: []
};
const servers = [];
const providerEvents = new EventEmitter();
let browser;
let page;
let aRevision = 1;
let releaseHeldCatalog;
let holdACatalog = false;

async function sourcePreflight() {
  report.mode = 'preflight';
  report.codeHashes = {};
  for (const relative of ['app.js', 'core/db-manager.js', 'js/ape-anle/ape-anle-core.js']) {
    await check(`Syntax: ${relative}`, () => {
      const source = fs.readFileSync(path.join(FRONTEND, relative), 'utf8');
      new vm.Script(source, { filename: relative });
      report.codeHashes[relative] = digest(source);
    });
  }
  await check('Connection/Analysis/Filters HTML is byte-identical to baseline', () => {
    const original = execFileSync('git', ['show', `${BASELINE}:IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html`], { cwd: REPO, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const expected = tabsBlock(original), current = tabsBlock(fs.readFileSync(HTML_PATH, 'utf8'));
    assert.equal(current, expected);
    report.tabMarkupSha256 = digest(current);
  });
  process.exitCode = report.checks.some(c => c.status === 'FAIL') ? 1 : 0;
}

async function serveOnly() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  report.mode = 'serve-only';
  report.uiAssertionsExecuted = false;
  await check('Connection/Analysis/Filters HTML is byte-identical to baseline', () => {
    const original = execFileSync('git', ['show', `${BASELINE}:IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html`], { cwd: REPO, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const expected = tabsBlock(original), current = tabsBlock(fs.readFileSync(HTML_PATH, 'utf8'));
    assert.equal(current, expected);
    report.tabMarkupSha256 = digest(current);
  });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
  const csp = "default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'";
  let origin;
  origin = await listen((req, res) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, origin);
    if (url.pathname === '/__qa/a/revision/1' || url.pathname === '/__qa/a/revision/2') {
      aRevision = Number(url.pathname.slice(-1));
      json(res, { fixture: 'A', revision: aRevision, synthetic: true }); return;
    }
    if (url.pathname === '/__qa/readiness.json' || url.pathname === '/__qa/receipt.json') {
      json(res, {
        ready: true, syntheticFixtures: true, browserAssertionsExecuted: false,
        frontend: `${origin}/index-v4.html`, fixtureA: `${origin}/fixture-a`, fixtureB: `${origin}/fixture-b`, fixtureFailure: `${origin}/fixture-fail`,
        username: 'fixture-user', password: 'fixture-password', revisionA: aRevision,
        tabMarkupSha256: report.tabMarkupSha256,
        checks: report.checks, providerRequests: report.providerRequests,
        notes: 'External network is blocked by the HTTP response CSP. UI validation must be observed separately.'
      }); return;
    }
    const match = url.pathname.match(/^\/fixture-(a|b|fail)\/player_api\.php$/);
    if (match) {
      const label = match[1].toUpperCase();
      const action = url.searchParams.get('action') || 'auth';
      recordProviderRequest({ provider: label, action, revision: label === 'A' ? aRevision : 1 });
      if (action === 'auth') {
        json(res, {
          user_info: { auth: 1, status: 'Active', max_connections: '1', allowed_output_formats: ['m3u8', 'ts'], exp_date: '4102444800' },
          server_info: { url: '127.0.0.1', port: String(new URL(origin).port), server_protocol: 'http', timezone: 'UTC' }
        });
      } else if (action === 'get_live_categories') {
        json(res, [{ category_id: '1', category_name: 'TEST Deportes' }, { category_id: '2', category_name: 'TEST Noticias' }]);
      } else if (action === 'get_live_streams') {
        json(res, label === 'FAIL' ? { declaredFixtureFailure: true } : fixtureChannels(label, `${origin}/fixture-${label.toLowerCase()}`));
      } else json(res, []);
      return;
    }
    const name = decodeURIComponent(url.pathname === '/' ? '/index-v4.html' : url.pathname);
    const file = path.resolve(FRONTEND, `.${name}`);
    if (!file.startsWith(FRONTEND + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found in local frontend'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  report.allowedNetworkOrigins = [origin];
  report.servedFrontend = `${origin}/index-v4.html`;
  fs.writeFileSync(path.join(OUTPUT, 'serve-only-ready.json'), JSON.stringify({
    frontend: `${origin}/index-v4.html`,
    readiness: `${origin}/__qa/readiness.json`,
    fixtureA: `${origin}/fixture-a`, fixtureB: `${origin}/fixture-b`, fixtureFailure: `${origin}/fixture-fail`,
    reviseA: `${origin}/__qa/a/revision/2`,
    username: 'fixture-user', password: 'fixture-password',
    syntheticFixtures: true, csp
  }, null, 2));
  process.stdout.write(`READY ${JSON.stringify({ frontend: report.servedFrontend, readiness: `${origin}/__qa/readiness.json`, fixtureA: `${origin}/fixture-a`, fixtureB: `${origin}/fixture-b`, fixtureFailure: `${origin}/fixture-fail`, reviseA: `${origin}/__qa/a/revision/2`, username: 'fixture-user', password: 'fixture-password' })}\n`);
  await new Promise(resolve => {
    process.once('SIGTERM', resolve); process.once('SIGINT', resolve);
    // Keep an accidentally abandoned local QA fixture bounded in lifetime.
    setTimeout(resolve, 20 * 60 * 1000).unref();
  });
}

function redact(value) {
  return String(value).replace(/https?:\/\/[^\s"'<>]+/g, '[url]')
    .replace(/(username|password|token|key)=([^&\s]+)/gi, '$1=[redacted]');
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function recordProviderRequest(detail) {
  report.providerRequests.push(detail);
  providerEvents.emit('request', detail);
}
function providerRequestCount(provider, action) {
  return report.providerRequests.filter(r => r.provider === provider && r.action === action).length;
}
async function waitForProviderRequest(provider, action, previousCount = 0) {
  if (providerRequestCount(provider, action) > previousCount) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      providerEvents.off('request', onRequest);
      reject(new Error(`No real HTTP ${action} request reached fixture ${provider}`));
    }, 25000);
    function onRequest() {
      if (providerRequestCount(provider, action) <= previousCount) return;
      clearTimeout(timeout);
      providerEvents.off('request', onRequest);
      resolve();
    }
    providerEvents.on('request', onRequest);
  });
}
function tabsBlock(html) {
  const start = html.indexOf('<!-- TAB: CONEXIÓN -->');
  const end = html.indexOf('<!-- TAB: RANKING -->', start);
  assert(start >= 0 && end > start, 'Tab boundary comments must exist');
  return html.slice(start, end);
}
async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    report.checks.push({ name, status: 'PASS', elapsedMs: Date.now() - started, ...(detail ? { detail } : {}) });
    process.stdout.write(`PASS ${name}\n`);
    return true;
  } catch (error) {
    const message = redact(error.message);
    report.checks.push({ name, status: 'FAIL', elapsedMs: Date.now() - started, error: message });
    process.stdout.write(`FAIL ${name}: ${message.slice(0, 600)}\n`);
    return false;
  }
}
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
function json(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function fixtureChannels(label, origin) {
  const start = label === 'A' && aRevision === 2 ? 2 : 1;
  const total = label === 'A' ? 130 : 10;
  return Array.from({ length: total }, (_, index) => {
    const id = start + index;
    const es = id % 2 === 0;
    return {
      num: index + 1, stream_id: id,
      name: `${es ? 'ES' : 'EN'} TEST ${label} ${es ? 'Deportes HEVC 4K' : 'Noticias H264 HD'} ${String(id).padStart(3, '0')}`,
      stream_type: 'live', stream_icon: '', epg_channel_id: `test-${label}-${id}`,
      // A and B intentionally share an EPG identity but have distinct names,
      // source origins and provider IDs. Cached metadata must remain isolated.
      tvg_id: id === 2 ? 'fixture-shared-station' : `fixture-${label}-${id}`,
      category_id: es ? '1' : '2', category_name: es ? 'TEST Deportes' : 'TEST Noticias',
      added: '1', custom_sid: '', tv_archive: 0, tv_archive_duration: 0,
      direct_source: `${origin}/fixture-media/${id}.m3u8`,
      url: `${origin}/fixture-media/${id}.m3u8`,
      codec: es ? 'HEVC' : 'H264', language: es ? 'ES' : 'EN',
      bitrate: es ? 18000 : 6000, width: es ? 3840 : 1920,
      height: es ? 2160 : 1080, fps: 50
    };
  });
}
async function fixtureProvider(label) {
  let origin;
  origin = await listen((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*'
      });
      res.end(); return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname !== '/player_api.php') { res.writeHead(404); res.end('No media is served by this fixture'); return; }
    const action = url.searchParams.get('action') || 'auth';
    recordProviderRequest({ provider: label, action, revision: label === 'A' ? aRevision : 1 });
    if (action === 'auth') {
      json(res, {
        user_info: { auth: 1, status: 'Active', max_connections: '1', allowed_output_formats: ['m3u8', 'ts'], exp_date: '4102444800' },
        server_info: { url: '127.0.0.1', port: String(new URL(origin).port), server_protocol: 'http', timezone: 'UTC' }
      });
    } else if (action === 'get_live_categories') {
      json(res, [{ category_id: '1', category_name: 'TEST Deportes' }, { category_id: '2', category_name: 'TEST Noticias' }]);
    } else if (action === 'get_live_streams') {
      const finish = () => json(res, label === 'FAIL' ? { declaredFixtureFailure: true } : fixtureChannels(label, origin));
      if (label === 'A' && holdACatalog) { releaseHeldCatalog = finish; } else finish();
    } else { json(res, []); }
  });
  return origin;
}
async function screenshot(name) {
  const target = path.join(OUTPUT, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false });
  report.screenshots.push(target);
}
async function tab(name) {
  await page.locator(`.tab-button[data-tab="${name}"]`).click();
  await page.waitForFunction(id => document.getElementById(`tab-${id}`)?.classList.contains('active'), name);
}
async function form(origin, label) {
  await tab('connection');
  await page.locator('#serverName').fill(`TEST ${label}`);
  await page.locator('#baseUrl').fill(origin);
  await page.locator('#username').fill('fixture-user');
  await page.locator('#password').fill('fixture-password');
}
async function settled() {
  await page.waitForFunction(() => {
    const app = window.app;
    return app && !app._connectionInProgress && !document.getElementById('btnConnect').disabled;
  }, null, { timeout: 25000 });
}
async function state() {
  return page.evaluate(() => ({
    count: app.state.channelsMaster.length,
    visible: app.state.channels.length,
    servers: (app.state.activeServers || []).map(s => ({ id: s.id, name: s.name, count: app.state.channelsMaster.filter(c => c.serverId === s.id).length })),
    channels: app.state.channelsMaster.map(c => {
      let sourceOrigin = null;
      try { sourceOrigin = new URL(c.url || c.base?.url || c.direct_source || '').origin; } catch (_) { }
      return { id: String(c.stream_id || c.raw?.stream_id || c.base?.raw?.stream_id || c.id), name: c.name, serverId: c.serverId, sourceOrigin, tvgId: c.tvg_id || c.tvgId || null };
    }),
    columns: app.state.activeColumns,
    currentServer: app.state.currentServer ? { id: app.state.currentServer.id, name: app.state.currentServer.name, baseUrl: app.state.currentServer.baseUrl } : null,
    flag: !!app._connectionInProgress,
    activeTabs: [...document.querySelectorAll('.tab-content.active')].map(e => e.id),
    status: document.getElementById('connectionStatus').innerText
  }));
}
async function expectVisible(predicate, description) {
  const data = await page.evaluate(() => ({
    total: app.state.channelsMaster.length,
    names: app.state.channels.map(c => c.name),
    renderedRows: document.querySelectorAll('#channelsTableBody tr').length,
    totalLabel: document.getElementById('statTotal').textContent,
    activeLabel: document.getElementById('statActive').textContent
  }));
  assert.equal(data.total, 140, 'Filters must not alter channelsMaster');
  assert(data.names.length > 0, `${description}: nonempty result`);
  assert(data.names.every(predicate), description);
  assert.equal(Number(data.totalLabel.replace(/[^0-9]/g, '')), 140);
  assert.equal(Number(data.activeLabel.replace(/[^0-9]/g, '')), data.names.length);
  assert(data.renderedRows <= 100, 'Rendered rows must be paginated');
  return { count: data.names.length };
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  report.mode = 'browser';
  let playwright;
  try { playwright = require('playwright'); }
  catch (_) {
    const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    try { if (modules) playwright = createRequire(path.join(modules, '__ape_tabs_loader__.cjs'))('playwright'); }
    catch (_) { /* Report an unavailable dependency below, never a fake PASS. */ }
  }
  if (!playwright || !fs.existsSync(CHROME)) {
    report.unavailable = 'Playwright or Chromium is unavailable';
    process.exitCode = 2; return;
  }

  await check('Connection/Analysis/Filters HTML is byte-identical to baseline', () => {
    const original = execFileSync('git', ['show', `${BASELINE}:IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html`], { cwd: REPO, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const expected = tabsBlock(original), current = tabsBlock(fs.readFileSync(HTML_PATH, 'utf8'));
    assert.equal(current, expected);
    report.tabMarkupSha256 = digest(current);
    return { baseline: BASELINE, sha256: report.tabMarkupSha256 };
  });

  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
  let networkCsp;
  const appOrigin = await listen((req, res) => {
    if (networkCsp) res.setHeader('Content-Security-Policy', networkCsp);
    const url = new URL(req.url, 'http://127.0.0.1');
    const name = decodeURIComponent(url.pathname === '/' ? '/index-v4.html' : url.pathname);
    const file = path.resolve(FRONTEND, `.${name}`);
    if (!file.startsWith(FRONTEND + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found in local frontend'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  const originA = await fixtureProvider('A');
  const originB = await fixtureProvider('B');
  const originFail = await fixtureProvider('FAIL');
  const allowed = new Set([appOrigin, originA, originB, originFail]);
  report.allowedNetworkOrigins = [...allowed];
  networkCsp = `default-src 'self' data: blob:; connect-src 'self' ${originA} ${originB} ${originFail}; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'`;

  browser = await playwright.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || allowed.has(url.origin)) return route.continue();
    report.externalRequestsBlocked++;
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ columns }) => {
    // Ordinary persisted settings, not application hooks or substituted methods.
    sessionStorage.setItem('ape_session_started', 'true');
    if (!localStorage.getItem('iptv_field_source_config')) {
      localStorage.setItem('iptv_field_source_config', JSON.stringify({ version: '4.8', timestamp: Date.now(), selectedColumns: columns, sourcePolicies: {} }));
    }
  }, { columns: COLUMNS });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => { if (report.pageErrors.length < 30) report.pageErrors.push(redact(error.message)); });
  page.on('console', message => { report.consoleCounts[message.type()] = (report.consoleCounts[message.type()] || 0) + 1; });
  await page.goto(`${appOrigin}/index-v4.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.app?.db?.db && typeof document.getElementById('searchQuery')?.oninput === 'function', null, { timeout: 30000 });
  report.uiAssertionsExecuted = true;
  await check('Real app, IndexedDB and filter engine initialized', async () => {
    const initialized = await page.evaluate(() => ({
      db: app.db.db instanceof IDBDatabase,
      engine: app.filterEngine instanceof window.AdvancedFilterEngine,
      name: app.constructor.name,
      columns: app.state.activeColumns
    }));
    assert.equal(initialized.db, true); assert.equal(initialized.engine, true);
    assert.equal(initialized.name, 'IPTVNavigatorPro'); assert.deepEqual(initialized.columns, COLUMNS);
  });
  await check('Original tab and control labels remain present', async () => {
    assert.deepEqual(await page.locator('nav.tabs .tab-button').allTextContents().then(v => v.map(t => t.trim())), ['Conexión', 'Análisis', 'Filtros+', 'Ranking', 'Fuentes', 'Servidores', 'Generador', 'Telemetría', 'Exportar', 'Compartir']);
    for (const id of ['connectionForm', 'serverName', 'baseUrl', 'username', 'password', 'apiType', 'btnConnect', 'btnAddServer', 'btnClear', 'activeServersList', 'connectionStatus', 'btnProbeQuality', 'btnLoadProbeResults', 'btnAutoClassify', 'btnExportToLAB', 'searchQuery', 'btnToggleCols', 'filterTier', 'filterCodec', 'filterLanguage', 'channelsTable', 'filterBuilderContainer', 'btnApplyFilters', 'btnAddFilterGroup', 'btnClearFilters', 'btnEditFilters']) {
      assert.equal(await page.locator(`#${id}`).count(), 1, `One original control: ${id}`);
    }
  });
  await screenshot('01-connection');

  holdACatalog = true;
  await form(originA, 'A');
  await page.locator('#btnConnect').click();
  await page.waitForFunction(() => app._connectionInProgress === true);
  await waitForProviderRequest('A', 'get_live_streams');
  assert(releaseHeldCatalog, 'Fixture A received the real catalog request');
  await check('Duplicate clicks remain guarded while real HTTP is pending', async () => {
    assert.equal(await page.locator('#btnConnect').isDisabled(), true);
    if (!await page.locator('#btnAddServer').isDisabled()) await page.locator('#btnAddServer').click();
    assert.equal(report.providerRequests.filter(r => r.provider === 'A' && r.action === 'get_live_streams').length, 1);
  });
  holdACatalog = false; releaseHeldCatalog(); releaseHeldCatalog = null;
  await settled();
  const connectedA = await check('Form connection reaches Analysis and releases loading', async () => {
    const data = await state();
    assert.equal(data.count, 130);
    assert.deepEqual(data.activeTabs, ['tab-analysis']); assert.equal(data.flag, false);
    assert.equal(data.servers.length, 1); assert.equal(data.servers[0].count, 130);
    assert(!/Conectando/.test(data.status), 'Connection chip must leave its pending state');
    assert.deepEqual(data.columns, [...COLUMNS, ...CLASSIFICATION_COLUMNS]);
  });
  assert(connectedA, 'Fixture A connection failed; dependent scenarios were not run');
  await screenshot('02-analysis');

  await form(originB, 'B');
  await page.locator('#btnAddServer').click();
  await waitForProviderRequest('B', 'get_live_streams');
  await settled();
  const connectedB = await check('Adding B preserves A and overlapping provider stream IDs', async () => {
    const data = await state();
    assert.equal(data.count, 140);
    assert.deepEqual(data.servers.map(s => s.count).sort((a, b) => a - b), [10, 130]);
    assert.equal(data.channels.filter(c => c.id === '2').length, 2);
    assert.equal(new Set(data.channels.map(c => `${c.serverId}:${c.id}`)).size, 140);
    for (const [label, origin] of [['A', originA], ['B', originB]]) {
      const server = data.servers.find(s => s.name === `TEST ${label}`);
      assert(server, `Fixture ${label} must retain its server`);
      const shared = data.channels.find(c => c.serverId === server.id && c.id === '2');
      assert(shared, `Fixture ${label} shared TVG channel exists`);
      assert.equal(shared.tvgId, 'fixture-shared-station');
      assert(shared.name.includes(`TEST ${label}`), 'A TVG cache collision must not replace the provider name');
      assert.equal(shared.sourceOrigin, origin, 'A TVG cache collision must not replace the source origin');
    }
  });
  assert(connectedB, 'Fixture B append/cache isolation failed; dependent scenarios were not run');

  // Save A through its existing chip action, then use the real library button.
  await tab('connection');
  await page.locator('#activeServersList > div').filter({ hasText: 'TEST A' }).getByTitle('Guardar en Biblioteca').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('iptv_server_library') || '[]').some(s => s.name === 'TEST A'));
  aRevision = 2;
  const beforeB = (await state()).channels.filter(c => c.name.includes('TEST B')).map(c => `${c.serverId}:${c.id}`).sort();
  const requestsBeforeReconnect = providerRequestCount('A', 'get_live_streams');
  await tab('servers');
  await page.locator('#savedServersTableBody tr').filter({ hasText: 'TEST A' }).getByTitle('Conectar', { exact: true }).click();
  await waitForProviderRequest('A', 'get_live_streams', requestsBeforeReconnect);
  await settled();
  const reconnectedA = await check('Library reconnect refreshes A while keeping all B channels', async () => {
    const data = await state();
    assert.equal(data.count, 140);
    assert.deepEqual(data.channels.filter(c => c.name.includes('TEST B')).map(c => `${c.serverId}:${c.id}`).sort(), beforeB);
    assert(!data.channels.some(c => c.name.includes('TEST A') && c.name.endsWith('001')));
    assert(data.channels.some(c => c.name.includes('TEST A') && c.name.endsWith('131')));
    assert.equal(new Set(data.channels.map(c => `${c.serverId}:${c.id}`)).size, 140);
    assert.deepEqual(data.activeTabs, ['tab-analysis']);
    assert(!/Conectando/.test(data.status), 'Library success chip must leave pending state');
    const sharedA = data.channels.find(c => c.name.includes('TEST A') && c.id === '2');
    assert(sharedA, 'Reconnecting A must not restore cached B name for the shared TVG ID');
    assert.equal(sharedA.sourceOrigin, originA);
  });
  assert(reconnectedA, 'Fixture A reconnect failed; dependent scenarios were not run');

  await tab('analysis');
  await page.locator('#searchQuery').fill('TEST B');
  await check('Free search filters the rendered result without changing master', () => expectVisible(n => n.includes('TEST B'), 'Search result contains TEST B'));
  await page.locator('#searchQuery').fill('');
  await page.locator('#filterLanguage').selectOption('es');
  await page.locator('#filterCodec').selectOption('HEVC');
  await check('Language and codec filters compose with the real pipeline', () => expectVisible(n => n.startsWith('ES ') && n.includes('HEVC'), 'ES + HEVC intersection'));
  await page.locator('#filterLanguage').selectOption('ALL');
  await page.locator('#filterCodec').selectOption('ALL');

  await tab('filters');
  await page.locator('#btnAddFilterGroup').click();
  let group = page.locator('#filterBuilderContainer .filter-group').nth(0);
  await group.locator('input').nth(0).fill('TEST A');
  await group.getByRole('button', { name: '+ Regla', exact: true }).click();
  group = page.locator('#filterBuilderContainer .filter-group').nth(0);
  await group.locator('input').nth(1).fill('HEVC');
  await page.locator('#btnApplyFilters').click();
  await page.waitForFunction(() => !document.getElementById('btnConnect').disabled);
  await check('Advanced AND rules use the real filter engine', () => expectVisible(n => n.includes('TEST A') && n.includes('HEVC'), 'Two-rule AND group'));
  await page.locator('#btnAddFilterGroup').click();
  group = page.locator('#filterBuilderContainer .filter-group').nth(1);
  await group.locator('input').nth(0).fill('TEST B');
  await page.locator('#btnApplyFilters').click();
  await page.waitForFunction(() => !document.getElementById('btnConnect').disabled);
  await check('Advanced groups combine through OR without losing master', async () => {
    const detail = await expectVisible(n => (n.includes('TEST A') && n.includes('HEVC')) || n.includes('TEST B'), 'OR between groups');
    assert.equal(detail.count, 75); return detail;
  });
  await screenshot('03-filters');

  await tab('analysis');
  await page.locator('#searchQuery').fill('TEST B');
  await page.locator('#filterLanguage').selectOption('es');
  await tab('filters');
  await page.locator('#btnClearFilters').click();
  await check('Clear restores full result and keeps displayed controls consistent', async () => {
    const data = await page.evaluate(() => ({
      total: app.state.channelsMaster.length, shown: app.state.channels.length,
      query: document.getElementById('searchQuery').value,
      tier: document.getElementById('filterTier').value,
      codec: document.getElementById('filterCodec').value,
      language: document.getElementById('filterLanguage').value,
      groups: app.state.activeFilter.groups.length
    }));
    assert.deepEqual(data, { total: 140, shown: 140, query: '', tier: 'ALL', codec: 'ALL', language: 'ALL', groups: 0 });
  });
  // Reset via visible controls after the assertion, so a stale UI defect cannot
  // contaminate the independent persistence and error-release cases.
  await tab('analysis');
  await page.locator('#searchQuery').fill('');
  await page.locator('#filterLanguage').selectOption('ALL');
  // The product initializes source buttons asynchronously 50 ms after opening.
  // Wait for that actual completion so its saved-state restore cannot race the
  // following checkbox click; no product function is replaced or invoked here.
  await Promise.all([
    page.waitForEvent('console', {
      predicate: message => /FieldSourceSelectorHandler: .*botones inicializados/.test(message.text())
    }),
    page.locator('#btnToggleCols').click()
  ]);
  await page.locator('#col_country').check();
  await page.locator('#btnSaveFieldConfig').click();
  await page.locator('#btnToggleCols').click();
  const columnsBeforeReload = (await state()).columns;
  await check('Column selection is applied and saved through the existing controls', async () => {
    assert.deepEqual(columnsBeforeReload, [...COLUMNS, 'country']);
    const savedColumns = await page.evaluate(() => JSON.parse(localStorage.getItem('iptv_field_source_config') || '{}').selectedColumns);
    assert.deepEqual(savedColumns, columnsBeforeReload);
  });
  const streamRequestsBeforeReload = report.providerRequests.filter(r => r.action === 'get_live_streams').length;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.app?.db?.db && typeof document.getElementById('searchQuery')?.oninput === 'function', null, { timeout: 25000 });
  await check('Real reload restores both catalogs and selected columns from storage', async () => {
    const data = await state();
    assert.equal(data.count, 140); assert.equal(data.servers.length, 2);
    assert.deepEqual(data.servers.map(s => s.count).sort((a, b) => a - b), [10, 130]);
    assert.equal(new Set(data.channels.map(c => `${c.serverId}:${c.id}`)).size, 140);
    assert.deepEqual(data.columns, columnsBeforeReload);
    assert.equal(report.providerRequests.filter(r => r.action === 'get_live_streams').length, streamRequestsBeforeReload, 'Reload should use IndexedDB, not re-download fixture catalogs');
    assert(data.channels.some(c => c.name.includes('TEST A') && c.name.endsWith('131')));
    assert(!data.channels.some(c => c.name.includes('TEST A') && c.name.endsWith('001')));
    for (const [label, origin] of [['A', originA], ['B', originB]]) {
      const shared = data.channels.find(c => c.name.includes(`TEST ${label}`) && c.id === '2');
      assert(shared, `Fixture ${label} shared TVG channel survives a real reload`);
      assert.equal(shared.sourceOrigin, origin);
    }
  });

  const currentBeforeFailure = (await state()).currentServer;
  await form(originFail, 'FAIL');
  const failCount = providerRequestCount('FAIL', 'get_live_streams');
  await page.locator('#btnConnect').click();
  await waitForProviderRequest('FAIL', 'get_live_streams', failCount);
  await settled();
  await check('Invalid fixture response releases loading and preserves prior catalogs', async () => {
    assert(report.providerRequests.some(r => r.provider === 'FAIL' && r.action === 'get_live_streams'));
    const data = await state(); assert.equal(data.count, 140); assert.equal(data.flag, false);
    assert.deepEqual(data.currentServer, currentBeforeFailure, 'A failed download restores the previously selected server');
    await tab('analysis'); await tab('filters'); await tab('connection');
    assert(!/Conectando/.test(data.status));
  });
  await screenshot('04-final-connection');
  report.finalState = await state();
  report.uiSuiteCompleted = true;
  process.exitCode = report.checks.some(c => c.status === 'FAIL') ? 1 : 0;
}

(async () => {
  try {
    if (process.argv.includes('--preflight')) await sourcePreflight();
    else if (process.argv.includes('--serve-only')) await serveOnly();
    else await main();
  }
  catch (error) {
    report.fatal = redact(error.message);
    process.stdout.write(`FATAL ${report.fatal}\n`);
    process.exitCode = 1;
    if (page) {
      try { report.lastState = await state(); await screenshot('failure'); } catch (_) { }
    }
  } finally {
    if (releaseHeldCatalog) { try { releaseHeldCatalog(); } catch (_) { } }
    if (browser) { try { await browser.close(); } catch (error) { report.browserCleanupError = redact(error.message); } }
    for (const server of servers) {
      try { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
      catch (error) { (report.serverCleanupErrors ||= []).push(redact(error.message)); }
    }
    report.finishedAt = new Date().toISOString();
    report.pass = report.checks.filter(c => c.status === 'PASS').length;
    report.fail = report.checks.filter(c => c.status === 'FAIL').length;
    report.result = report.unavailable ? 'UNAVAILABLE' : report.fatal || report.fail ? 'FAIL' : report.mode === 'browser' && report.uiSuiteCompleted ? 'PASS' : 'STATIC_ONLY';
    fs.mkdirSync(OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT, 'receipt.json'), JSON.stringify(report, null, 2));
    process.stdout.write(`Receipt: ${path.join(OUTPUT, 'receipt.json')}\n${report.pass} PASS, ${report.fail} FAIL${report.fatal ? ', 1 fatal interruption' : ''}\n`);
  }
})();
