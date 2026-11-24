/* Real-browser IndexedDB cases shared by Playwright and the local --serve page. */
(function (root) {
    async function transactionChecks() {
        const rows = [];
        const check = (name, condition) => {
            rows.push({ name, pass: Boolean(condition) });
            if (!condition) throw new Error(name);
        };
        const bounded = promise => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('TEST_DEADLINE: promise did not settle')), 3000);
            promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
        });
        const rejects = async (name, promise, expected) => {
            let error;
            try { await bounded(promise); } catch (caught) { error = caught; }
            check(name + (error ? ` (${error.name})` : ''), error && expected.includes(error.name));
        };
        const manager = window.dbManager;
        const db = await bounded(manager.ready());
        check('ready opens the real database at the unchanged version', db instanceof IDBDatabase && db.version === 1);
        check('stores and channel indexes are preserved',
            JSON.stringify(Array.from(db.objectStoreNames)) === JSON.stringify(['app_state', 'channels', 'servers']) &&
            JSON.stringify(Array.from(db.transaction('channels').objectStore('channels').indexNames)) === JSON.stringify(['serverUrl', 'updatedAt']));
        check('missing state returns null', await manager.getAppState('absent') === null);
        const state = {
            filters: { country: 'CO', selected: ['UHD', 'FHD'], enabled: true },
            lab: Array.from({ length: 12 }, (_, i) => ({ id: `P${i / 2}`, metadata: { order: i } }))
        };
        await manager.saveAppState('durable-state', state);
        check('application state round-trips including all 12 profile IDs',
            JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));
        const legacyChannel = { id: 'keep-other-server', serverUrl: 'https://provider-b.invalid', name: 'Other server fixture' };
        const putNative = (storeName, value) => new Promise((resolve, reject) => {
            const tx = manager.db.transaction(storeName, 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = event => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Fixture aborted', 'AbortError'));
            tx.objectStore(storeName).put(value);
        });
        await putNative('channels', legacyChannel);
        check('loadChannels reads legacy rows only when no snapshot exists',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify([legacyChannel]));
        check('saveChannels keeps its successful return value', await manager.saveChannels([legacyChannel]) === true);
        await manager.saveChannelsBulk([{ tvg_id: 'fixture-a', name: 'Channel fixture', codecFamily: 'HEVC' }], 'https://provider-a.invalid');
        const map = await manager.getCachedMetadata();
        check('cache reads a real Map and preserves other servers', map instanceof Map && map.size === 2 && map.get('tvg:fixture-a').codecFamily === 'HEVC' && map.has('keep-other-server'));

        // Observe the native transaction, then abort it in the same task's
        // microtask checkpoint. The manager still creates its real requests.
        const withAbort = async operation => {
            const native = IDBDatabase.prototype.transaction;
            const currentDb = manager.db;
            currentDb.transaction = function (...args) {
                const tx = native.apply(this, args);
                queueMicrotask(() => tx.abort());
                return tx;
            };
            try { return await operation(); } finally { delete currentDb.transaction; }
        };
        await withAbort(() => rejects('saveAppState rejects a native abort', manager.saveAppState('durable-state', 'must roll back'), ['AbortError']));
        check('aborted state write preserves the committed value', JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));
        await withAbort(() => rejects('getAppState rejects a native abort instead of treating it as missing data', manager.getAppState('durable-state'), ['AbortError']));
        await withAbort(() => rejects('saveChannels rejects a native abort', manager.saveChannels([{ id: 'aborted-channel' }]), ['AbortError']));
        await withAbort(() => rejects('saveChannelsBulk rejects a native abort', manager.saveChannelsBulk([{ tvg_id: 'aborted-bulk' }], 'https://provider-a.invalid'), ['AbortError']));

        // Abort after a successful native get. Request success alone must
        // not be mistaken for transaction completion.
        const nativeGet = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (...args) {
            const req = nativeGet.apply(this, args);
            req.addEventListener('success', () => req.transaction.abort(), { once: true });
            return req;
        };
        try {
            await rejects('getAppState waits for transaction completion', manager.getAppState('durable-state'), ['AbortError']);
        } finally { IDBObjectStore.prototype.get = nativeGet; }

        const nativeCursor = IDBObjectStore.prototype.openCursor;
        IDBObjectStore.prototype.openCursor = function (...args) {
            const req = nativeCursor.apply(this, args);
            req.addEventListener('success', () => { if (req.result === null) req.transaction.abort(); });
            return req;
        };
        try {
            await rejects('getCachedMetadata rejects transaction abort even after the final cursor result', manager.getCachedMetadata(), ['AbortError']);
        } finally { IDBObjectStore.prototype.openCursor = nativeCursor; }

        // A duplicate add is a real IndexedDB request failure, separate
        // from an explicit abort. It rolls the whole write transaction back.
        const nativeTransaction = IDBDatabase.prototype.transaction;
        db.transaction = function (...args) {
            const tx = nativeTransaction.apply(this, args);
            tx.objectStore('app_state').add({ key: 'durable-state', value: 'duplicate' });
            return tx;
        };
        try {
            await rejects('saveAppState rejects a native ConstraintError', manager.saveAppState('uncommitted-state', 1), ['ConstraintError']);
        } finally { delete db.transaction; }
        check('transaction error does not commit later writes', await manager.getAppState('uncommitted-state') === null);

        await rejects('saveAppState exposes a clone error', manager.saveAppState('durable-state', () => {}), ['DataCloneError']);
        await rejects('saveChannels exposes a bad row and rolls back the preceding row', manager.saveChannels([{ id: 'partial-channel' }, { noId: true }]), ['DataError']);
        await rejects('saveChannelsBulk exposes a clone error and rolls back the preceding row', manager.saveChannelsBulk([
            { tvg_id: 'partial-bulk', name: 'Must roll back' },
            { tvg_id: 'invalid-bulk', qualityTags: () => {} }
        ], 'https://provider-a.invalid'), ['DataCloneError']);
        const afterFailures = await manager.getCachedMetadata();
        check('all failed channel batches preserve the original two cached rows',
            afterFailures.size === 2 && afterFailures.has('keep-other-server') && afterFailures.has('tvg:fixture-a'));
        check('failed catalog writes preserve the committed complete catalog',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify([legacyChannel]));

        const serverA = 'https://provider-a.invalid';
        const serverB = 'https://provider-b.invalid';
        const makeChannels = (serverId, start) => Array.from({ length: 10 }, (_, offset) => ({
            id: start + offset,
            serverId,
            name: `${serverId}${start + offset}`,
            base: { group: 'Fixture', source: 'native IndexedDB regression' },
            tech: { codec: 'HEVC', fps: 60 },
            selected: offset === 0
        }));
        const channelsB = makeChannels('B', 1);
        const originalCatalog = [...makeChannels('A', 1), ...channelsB];
        await manager.saveAppState('activeServers', {
            activeServers: [{ id: 'A', baseUrl: serverA + '/player_api.php' }, { id: 'B', baseUrl: serverB }]
        });
        await manager.saveAppState('serverLibrary', [{ id: 'A', baseUrl: serverA }]);
        await manager.saveChannels(originalCatalog);
        check('overlapping stream IDs from two servers survive without field or ID changes',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(originalCatalog));
        check('saving the catalog does not rewrite metadata or legacy rows', (await manager.getCachedMetadata()).size === 2);
        await putNative('channels', { id: 1, serverId: 'A', serverUrl: serverA, name: 'Retired A1 legacy row' });
        const replacementCatalog = [...makeChannels('A', 2), ...channelsB];
        await manager.saveChannels(replacementCatalog);
        check('replacing one server catalog does not restore a retired channel from old cache',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(replacementCatalog));
        check('retired legacy row remains preserved as cache instead of being deleted by repair', (await manager.getCachedMetadata()).has(1));

        manager.db.close();
        manager.initPromise = manager.openDB();
        await manager.ready();
        check('complete multiserver catalog survives a new IndexedDB connection',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(replacementCatalog));

        await withAbort(() => rejects('clearChannelsByServer rejects a native abort', manager.clearChannelsByServer(serverA), ['AbortError']));
        check('aborted server clear restores both catalog and cache',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(replacementCatalog) && (await manager.getCachedMetadata()).size === 3);
        check('server clear reports the authoritative catalog count', await manager.clearChannelsByServer(serverA) === 10);
        check('server clear preserves the other server despite overlapping stream IDs',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(channelsB));
        const cacheAfterServerClear = await manager.getCachedMetadata();
        check('server clear updates metadata and catalog together', cacheAfterServerClear.size === 1 && cacheAfterServerClear.has('keep-other-server'));
        check('server clear preserves unrelated application state', JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));

        await manager.saveAppState('activeServers', {
            activeServers: [{ id: 'A', baseUrl: 'https://shared.invalid/one/player_api.php' }, { id: 'B', baseUrl: 'https://shared.invalid/two/player_api.php' }]
        });
        await manager.saveAppState('serverLibrary', []);
        await manager.saveChannels(originalCatalog);
        await manager.clearChannelsByServer('https://shared.invalid/one/');
        check('server clear distinguishes different paths on the same host',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify(channelsB));
        await manager.saveAppState('activeServers', {
            activeServers: [{ id: 'A', baseUrl: serverA + '/player_api.php' }, { id: 'B', baseUrl: serverB }]
        });

        await withAbort(() => rejects('clearChannels rejects a native abort', manager.clearChannels(), ['AbortError']));
        check('aborted channel clear restores catalog and cache', (await manager.loadChannels()).length === 10 && (await manager.getCachedMetadata()).size === 1);
        await manager.clearChannels();
        check('channel clear stores an authoritative empty catalog and clears metadata',
            (await manager.loadChannels()).length === 0 && (await manager.getCachedMetadata()).size === 0 &&
            Array.isArray(await manager.getAppState('channelsListSnapshot')));
        check('channel clear preserves unrelated configuration', JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));

        await manager.saveChannels(channelsB);
        await manager.saveChannelsBulk([{ tvg_id: 'clear-all-fixture', name: 'Temporary cache fixture' }], serverB);
        await putNative('servers', { url: serverB, name: 'Server fixture' });
        const countNative = storeName => new Promise((resolve, reject) => {
            const tx = manager.db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).count();
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = event => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Fixture count aborted', 'AbortError'));
        });
        await withAbort(() => rejects('clearAll rejects a native abort', manager.clearAll(), ['AbortError']));
        check('aborted full clear preserves every store',
            (await manager.loadChannels()).length === 10 && (await manager.getCachedMetadata()).size === 1 &&
            await countNative('servers') === 1 && JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));
        await manager.clearAll();
        check('authorized full clear commits all three stores together',
            await countNative('channels') === 0 && await countNative('servers') === 0 && await countNative('app_state') === 0);

        // Restore known fixtures for the actual page reload. An empty catalog
        // must remain empty even though old metadata rows still exist.
        await putNative('channels', legacyChannel);
        await manager.saveChannelsBulk([{ tvg_id: 'fixture-a', name: 'Channel fixture', codecFamily: 'HEVC' }], serverA);
        await manager.saveAppState('durable-state', state);
        await manager.saveChannels([]);
        check('saving an empty catalog preserves metadata without loading it as channels',
            (await manager.loadChannels()).length === 0 && (await manager.getCachedMetadata()).size === 2);
        return rows;
    }
    async function lifecycleChecks() {
        const rows = [];
        const check = (name, pass) => { rows.push({ name, pass: Boolean(pass) }); if (!pass) throw new Error(name); };
        const bounded = promise => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('TEST_DEADLINE: promise did not settle')), 3000);
            promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
        });
        const open = (name, version) => new Promise((resolve, reject) => {
            const req = indexedDB.open(name, version);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const manager = window.dbManager;
        await manager.ready();
        const restored = await manager.getAppState('durable-state');
        check('application state and 12 profiles survive page reload', restored.filters.country === 'CO' && restored.lab.length === 12 && restored.lab[11].id === 'P5.5');
        check('both servers cache survives page reload', (await manager.getCachedMetadata()).size === 2);
        check('empty authoritative catalog survives page reload without resurrecting legacy cache',
            (await manager.loadChannels()).length === 0 && Array.isArray(await manager.getAppState('channelsListSnapshot')));

        // Hold a real older-version connection to produce onblocked. Closing
        // it later must not allow a rejected opening to upgrade in background.
        const blocker = await open(manager.dbName, 1);
        manager.db.close();
        manager.dbVersion = 2;
        let opening;
        const nativeOpen = IDBFactory.prototype.open;
        indexedDB.open = function (...args) {
            opening = nativeOpen.apply(this, args);
            return opening;
        };
        manager.initPromise = manager.openDB();
        delete indexedDB.open;
        const lateResult = new Promise(resolve => {
            opening.addEventListener('success', () => resolve('success'));
            opening.addEventListener('error', () => resolve(opening.error.name));
        });
        let blockedError;
        try { await bounded(manager.ready()); } catch (error) { blockedError = error; }
        check('ready rejects an actual blocked opening promptly', blockedError && blockedError.name === 'InvalidStateError');
        blocker.close();
        check('late opening is aborted after blocked rejection', await bounded(lateResult) === 'AbortError');
        const unchanged = await bounded(open(manager.dbName, 1));
        check('blocked opening leaves database version and stores unchanged', unchanged.version === 1 && unchanged.objectStoreNames.length === 3);
        unchanged.close();

        const newer = await bounded(open(manager.dbName, 2));
        newer.close();
        manager.dbVersion = 1;
        manager.initPromise = manager.openDB();
        let versionError;
        try { await bounded(manager.ready()); } catch (error) { versionError = error; }
        check('ready rejects a native open VersionError', versionError && versionError.name === 'VersionError');
        return rows;
    }
    const cases = { transactionChecks, lifecycleChecks };
    if (typeof module !== 'undefined' && module.exports) module.exports = cases;
    else root.DatabaseManagerBrowserCases = cases;
})(typeof window !== 'undefined' ? window : globalThis);
