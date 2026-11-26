/* Real Chromium/IndexedDB regression. No provider traffic or mocked algorithms.
 * node tests/anle-queue-browser.test.cjs --serve  (open the printed local URL)
 * node tests/anle-queue-browser.test.cjs          (Playwright + local Chromium)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const frontend = path.resolve(__dirname, '..');
const repo = path.resolve(frontend, '../..');
const corePath = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-anle/ape-anle-core.js';
const baseRef = process.env.ANLE_TEST_BASE_REF || '0342f3af3d27fcee5b9fd29c5eb1f27ee4086a2f';
const originalCore = execFileSync('git', ['show', baseRef + ':' + corePath], { cwd: repo });
const results = [];
const outputDir = process.env.ANLE_TEST_QA_DIR || process.env.ANLE_TEST_OUTPUT_DIR ||
    path.join(os.tmpdir(), 'ape-anle-browser-qa');
const receipt = {
    test: 'anle-queue-browser', baseRef, startedAt: new Date().toISOString(),
    scope: 'Real ANLE modules, offline seed metadata and real IndexedDB; no playback/QoE claim.',
    browserAssertionsExecuted: false, suiteCompleted: false, results
};

function saveReceipt() {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
}

function recordResult(result) {
    const index = results.findIndex(item => item.label === result.label);
    if (index < 0) results.push(result);
    else results[index] = result;
    receipt.browserAssertionsExecuted = true;
    saveReceipt();
}

async function runBrowserRegression({ label, count }) {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const file of [
        'js/ape-anle/anle-canonicalize.js', 'js/ape-anle/anle-dictionary.js',
        'js/ape-anle/anle-seed-syncer.js', 'js/ape-anle/anle-fingerprint.js',
        'js/ape-anle/anle-booster.js', 'js/ape-anle/anle-6stage-detection.js',
        'js/ape-anle/anle-learner.js', 'quality-inference.js', 'knn-scorer.js',
        'enrichment-module.js', label === 'baseline' ? 'baseline-core.js' : 'js/ape-anle/ape-anle-core.js'
    ]) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = file;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Cannot load ' + file));
            document.head.appendChild(script);
        });
    }
    const seed = await (await fetch('js/ape-anle/ANLE_SEED_FALLBACK.json')).json();
    await ANLE.seedSyncer.loadFallback();
    localStorage.setItem('anle.seed.lastSync', String(Date.now()));

    // Real enrichment module + the state contract used by ANLE. All dictionary,
    // inference, learner and booster methods execute their actual implementation.
    const app = { state: { channelsMaster: [] }, enrichmentModule: new EnrichmentModule() };
    await ANLE.core.init(app);
    let active = 0, peak = 0, calls = 0, learnerCalls = 0;
    const originalBoost = ANLE.booster.computeBoost.bind(ANLE.booster);
    ANLE.booster.computeBoost = async function (channel) {
        calls++; active++; peak = Math.max(peak, active);
        if (calls % 500 === 0) {
            document.getElementById('progress').textContent =
                `${label}: ${calls}/${count} augmentations; peak concurrency ${peak}`;
        }
        try { return await originalBoost(channel); } finally { active--; }
    };
    const originalObserve = ANLE.learner.observeBatch.bind(ANLE.learner);
    ANLE.learner.observeBatch = async function (channels) {
        learnerCalls++;
        return originalObserve(channels);
    };

    // Offline catalogue names come from the repository's existing fallback seed.
    // Repeated rows exercise load, with distinct IDs and no playback URLs.
    const makeChannels = (length, prefix) => Array.from({ length }, (_, i) => ({
        ...seed[i % seed.length], id: prefix + '-' + i,
        serverId: 'loopback-regression', raw: { num: i + 1 },
        group: (seed[i % seed.length].categories || []).join(' ')
    }));
    const channels = makeChannels(count, 'catalogue');
    const source = channels.map(ch => [ch.id, ch.name, ch.serverId, ch.raw.num]);
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 0);
    const started = performance.now();
    channels.forEach(ch => assert(app.enrichmentModule.enrichChannel(ch) === ch,
        'Enrichment return identity changed'));
    const callsBeforeYield = calls;
    await ANLE.core.processChannelBatch(channels);
    if (label === 'baseline') {
        while (active) await new Promise(resolve => setTimeout(resolve, 10));
    }
    clearInterval(heartbeat);
    const elapsedMs = performance.now() - started;
    assert(channels.every((ch, i) => JSON.stringify([ch.id, ch.name, ch.serverId, ch.raw.num]) ===
        JSON.stringify(source[i])), 'Channel identity/source fields changed');
    assert(channels.every(ch => ch._anleProcessed && ch.anle && ch.anleMediaType && ch.classificationFinal),
        'Missing completed ANLE fields');
    assert(learnerCalls === 1, 'Batch learning did not run once');
    assert(ticks > 0, 'UI heartbeat did not advance');
    assert(JSON.stringify(channels[0].anle) === JSON.stringify(await originalBoost(channels[0])),
        'Queue changed boost results');

    const main = { calls, peak, callsBeforeYield, count, ticks, elapsedMs: Math.round(elapsedMs) };
    const checks = [];
    if (label === 'baseline') {
        assert(peak >= count, 'Baseline did not reproduce the unbounded hook');
        checks.push('baseline_concurrency_defect_reproduced');
    } else {
        assert(callsBeforeYield === 0, 'Hook started dictionary work synchronously');
        assert(peak === 1, 'Dictionary augmentation exceeded serial concurrency');
        assert(calls === count, 'Hook and batch repeated augmentation');
        const stats = await ANLE.core.getStats();
        assert(stats.augmentationQueue.pending === 0 && !stats.augmentationQueue.running,
            'Queue did not drain');
        checks.push('full_catalogue_deduplicated', 'serial_dictionary_concurrency',
            'deferred_hook', 'unchanged_fields_and_results', 'learning_retained', 'ui_yield');

        const accepted = makeChannels(100, 'accepted');
        const beforeToggle = calls;
        accepted.forEach(ch => app.enrichmentModule.enrichChannel(ch));
        const completion = ANLE.core.augment(accepted[accepted.length - 1]);
        ANLE.core.setEnabled(false);
        await completion;
        assert(calls === beforeToggle + accepted.length && accepted.every(ch => ch._anleProcessed),
            'Disabling stranded or duplicated accepted work');

        const disabled = makeChannels(100, 'disabled');
        const afterDrain = calls;
        disabled.forEach(ch => app.enrichmentModule.enrichChannel(ch));
        await ANLE.core.processChannelBatch(disabled);
        await new Promise(resolve => setTimeout(resolve, 30));
        assert(calls === afterDrain && disabled.every(ch => !ch._anleProcessed),
            'Disabled automatic entry points accepted work');
        await ANLE.core.augment(disabled[0]);
        assert(disabled[0]._anleProcessed, 'Explicit public augment stopped working while disabled');
        ANLE.core.setEnabled(true);
        disabled.forEach(ch => app.enrichmentModule.enrichChannel(ch));
        await ANLE.core.processChannelBatch(disabled);
        // Explicit re-enrichment refreshes even the row already augmented above;
        // only simultaneous requests for that row must share their work.
        assert(calls === afterDrain + disabled.length + 1 && disabled.every(ch => ch._anleProcessed),
            'Re-enabling lost or duplicated work');
        checks.push('toggle_stops_new_automatic_work', 'accepted_work_settles',
            'explicit_public_api_preserved', 'public_augment_joins_hook');

        const refreshed = disabled[0];
        const beforeRefresh = calls;
        refreshed.country = 'CO';
        app.enrichmentModule.enrichChannel(refreshed);
        const refreshDeadline = performance.now() + 3000;
        while (refreshed.classificationFinal.country !== 'CO' && performance.now() < refreshDeadline) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert(calls === beforeRefresh + 1 && refreshed.classificationFinal.country === 'CO',
            'Re-enriching an existing channel did not refresh its overlay');
        checks.push('completed_channel_can_refresh');

        // Real InvalidStateError from an actually closed IndexedDB connection.
        const retry = makeChannels(1, 'retry')[0];
        ANLE.dictionary._db.close();
        await ANLE.core.augment(retry);
        assert(!retry._anleProcessed, 'Failed lookup marked complete');
        ANLE.dictionary._db = null;
        await ANLE.dictionary.open();
        await ANLE.core.augment(retry);
        assert(retry._anleProcessed && retry.anle, 'Failed channel could not retry');
        checks.push('real_database_error_is_retryable');
    }
    return { ok: true, label, main, checks };
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");
    if (url.pathname === '/results' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const result = JSON.parse(body);
                recordResult(result);
                if (process.argv.includes('--serve')) console.log(JSON.stringify(result));
            }
            catch { res.statusCode = 400; }
            res.end();
        });
        return;
    }
    if (url.pathname === '/results') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(results, null, 2));
    }
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<!doctype html><meta charset="utf-8"><title>ANLE IndexedDB regression</title>' +
            '<h1>ANLE — Real IndexedDB regression</h1><button id="run-test">Ejecutar prueba</button>' +
            '<p id="progress">Preparado: módulos e IndexedDB reales; conexiones limitadas a este origen local.</p>' +
            '<pre id="report"></pre><script src="runner.js"></script>');
    }
    if (url.pathname === '/runner.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(`document.getElementById('run-test').addEventListener('click', async () => {
            document.getElementById('run-test').disabled = true;
            document.getElementById('progress').textContent = 'Ejecutando prueba local…';
            const params = new URLSearchParams(location.search);
            const label = params.get('mode') === 'baseline' ? 'baseline' : 'patched';
            const count = Number(params.get('count')) || (label === 'baseline' ? 256 : 28655);
            let result;
            try { result = await (${runBrowserRegression.toString()})({ label, count }); }
            catch (error) { result = { ok: false, label, error: String(error.stack || error) }; }
            document.getElementById('progress').textContent = result.ok ? 'PASS' : 'FAIL';
            document.getElementById('run-test').textContent = 'Prueba terminada';
            document.getElementById('report').textContent = JSON.stringify(result, null, 2);
            try {
                await fetch('/results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result) });
            } finally { window.ANLE_REGRESSION_RESULT = result; }
        });`);
    }
    if (url.pathname === '/baseline-core.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(originalCore);
    }
    const file = path.join(frontend, url.pathname);
    if (!file.startsWith(frontend + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        return res.end();
    }
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/javascript');
    res.end(fs.readFileSync(file));
});

(async () => {
    await new Promise(resolve => server.listen(Number(process.env.ANLE_TEST_PORT) || 0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    console.log('ANLE_REGRESSION_URL=' + origin + '/?mode=patched&count=28655');
    console.log('ANLE_BASELINE_URL=' + origin + '/?mode=baseline&count=256');
    console.log('ANLE_RESULTS_URL=' + origin + '/results');
    console.log('ANLE_RECEIPT=' + path.join(outputDir, 'receipt.json'));
    if (process.argv.includes('--serve')) return;

    const playwrightPath = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
        ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright';
    const { chromium } = require(playwrightPath);
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
            headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
        for (const [label, count] of [['baseline', 256], ['patched', 28655]]) {
            const context = await browser.newContext();
            const externalRequests = [];
            await context.route('**/*', route => {
                if (route.request().url().startsWith(origin + '/')) return route.continue();
                externalRequests.push(new URL(route.request().url()).origin);
                return route.abort();
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(origin + '/?mode=' + label + '&count=' + count);
            await page.locator('#run-test').click();
            await page.waitForFunction(() => window.ANLE_REGRESSION_RESULT, null, { timeout: 180000 });
            const result = await page.evaluate(() => window.ANLE_REGRESSION_RESULT);
            result.externalRequests = externalRequests;
            result.pageErrors = errors;
            recordResult(result);
            console.log(JSON.stringify(result));
            assert.equal(result.ok, true, result.error);
            assert.deepEqual(externalRequests, [], 'Unexpected external request attempted');
            assert.deepEqual(errors, [], 'Uncaught browser error');
            await context.close();
        }
        receipt.suiteCompleted = true;
        console.log('PASS: real modules and IndexedDB; no external requests.');
    } finally {
        if (browser) await browser.close();
        server.close();
        saveReceipt();
    }
})().catch(error => {
    receipt.fatal = String(error.stack || error);
    saveReceipt();
    console.error(error);
    server.close();
    process.exitCode = 1;
});
