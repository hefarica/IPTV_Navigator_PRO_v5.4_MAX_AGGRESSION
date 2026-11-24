/*
 * Regression test for DatabaseManager using Chromium's real IndexedDB.
 * Uses isolated browser storage and local fixtures; never contacts providers.
 * Fault injection calls native IDBTransaction.abort() or native store.add().
 * No IndexedDB implementation, request, transaction or event is mocked.
 *
 * node frontend/tests/db-manager-indexeddb-browser.test.cjs
 * Add --serve to run in an existing browser on a new isolated local origin.
 * DB_MANAGER_SOURCE=/path/to/db-manager.js can verify a previous revision.
 * DB_MANAGER_QA_DIR=/path/to/output writes an optional JSON result receipt.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { transactionChecks, lifecycleChecks } = require('./db-manager-indexeddb-browser.cases.js');
const serveOnly = process.argv.includes('--serve');

let chromium;
if (!serveOnly) {
    try {
        ({ chromium } = require('playwright'));
    } catch (error) {
        if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
        ({ chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')));
    }
}

const sourcePath = process.env.DB_MANAGER_SOURCE || path.resolve(__dirname, '../core/db-manager.js');
const source = fs.readFileSync(sourcePath, 'utf8');
let completedCases = [];
let phase = 'browser launch';
function writeReceipt(status, error) {
    if (!process.env.DB_MANAGER_QA_DIR) return;
    const directory = path.resolve(process.env.DB_MANAGER_QA_DIR);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'db-manager-indexeddb-results.json'), JSON.stringify({
        suite: 'db-manager-indexeddb-browser',
        status,
        source: sourcePath,
        timestamp: new Date().toISOString(),
        completedCases,
        completedPasses: completedCases.filter(item => item.pass).length,
        error: error ? { name: error.name, message: error.message, phase } : null
    }, null, 2) + '\n');
}
const browserRunner = `<h1>DatabaseManager — IndexedDB real</h1><pre id="results">RUNNING</pre><script>
(async function () {
    var output = document.getElementById('results');
    var key = 'db-manager-test-transaction-results';
    try {
        var prior = sessionStorage.getItem(key);
        if (!prior) {
            var first = await DatabaseManagerBrowserCases.transactionChecks();
            sessionStorage.setItem(key, JSON.stringify(first));
            location.reload();
            return;
        }
        var last = await DatabaseManagerBrowserCases.lifecycleChecks();
        var rows = JSON.parse(prior).concat(last);
        output.textContent = rows.map(function (r) { return (r.pass ? 'PASS ' : 'FAIL ') + r.name; }).join('\\n') + '\\n\\n' + rows.length + ' PASS / 0 FAIL';
        document.title = rows.length + ' PASS — IndexedDB';
        sessionStorage.removeItem(key);
    } catch (error) {
        output.textContent = 'FAIL ' + error.name + ': ' + error.message;
        document.title = 'FAIL — IndexedDB';
    }
})();
</script>`;
const server = http.createServer((req, res) => {
    if (req.url === '/db-manager.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(source);
    } else if (req.url === '/cases.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(path.join(__dirname, 'db-manager-indexeddb-browser.cases.js'), 'utf8'));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end('<!doctype html><meta charset="utf-8"><title>IndexedDB regression</title><script src="/db-manager.js"></script><script src="/cases.js"></script>' + (serveOnly ? browserRunner : ''));
    }
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    if (serveOnly) {
        console.log(`IndexedDB test page: http://127.0.0.1:${server.address().port}/`);
        console.log('Dedicated test origin only. Page writes isolated fixtures and displays results after one reload.');
        return;
    }
    const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    let browser;
    try {
        browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        phase = 'transactions and catalog';
        const results = await page.evaluate(transactionChecks);
        completedCases = results;

        await page.reload();
        phase = 'reload and database lifecycle';
        const lifecycle = await page.evaluate(lifecycleChecks);
        const all = [...results, ...lifecycle];
        completedCases = all;
        for (const row of all) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
        assert.ok(all.every(row => row.pass));
        console.log(`\n${all.length} PASS / 0 FAIL — real Chromium IndexedDB`);
        writeReceipt('PASS');
        await context.close();
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    try { writeReceipt('FAIL', error); } catch (receiptError) { console.error(receiptError); }
    process.exitCode = 1;
});
