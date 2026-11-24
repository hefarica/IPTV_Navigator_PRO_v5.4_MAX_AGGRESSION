/* Real-browser IndexedDB cases shared by Playwright and the local --serve page.
 *
 * Diseño medido de la compilación local (V4.34): el store `channels` es el
 * catálogo Y la caché. La clave física es `serverId::id` y `_channelId`
 * conserva el id canónico para la app. No hay snapshot paralelo en app_state.
 * Estas comprobaciones cubren ese contrato y el endurecimiento transaccional:
 * abortos y errores nativos no pueden pasar en silencio ni dejar el catálogo a
 * medias. No se mockea IndexedDB, ni transacciones, ni eventos.
 */
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
            const label = error ? ` (${error.name}${error.message ? ': ' + error.message : ''})` : ' (promise resolved without error)';
            check(name + label, error && expected.includes(error.name));
        };
        const manager = window.dbManager;
        const db = await bounded(manager.ready());
        check('ready opens the real database at the unchanged version', db instanceof IDBDatabase && db.version === 1);
        check('stores and channel indexes are preserved',
            JSON.stringify(Array.from(db.objectStoreNames)) === JSON.stringify(['app_state', 'channels', 'servers']) &&
            JSON.stringify(Array.from(db.transaction('channels').objectStore('channels').indexNames)) === JSON.stringify(['serverUrl', 'updatedAt']));

        const putNative = (storeName, value) => new Promise((resolve, reject) => {
            const tx = manager.db.transaction(storeName, 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = event => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Fixture aborted', 'AbortError'));
            tx.objectStore(storeName).put(value);
        });
        const nativeGet = (storeName, key) => new Promise((resolve, reject) => {
            const tx = manager.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        const countStore = storeName => new Promise((resolve, reject) => {
            const tx = manager.db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).count();
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = event => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Fixture count aborted', 'AbortError'));
        });
        const view = list => (list || []).map(ch => `${ch.serverId || ''}:${ch.id}`).sort();

        await manager.clearAll();
        check('missing state returns null', await manager.getAppState('absent') === null);
        check('empty catalog loads as an empty list', (await manager.loadChannels()).length === 0);

        const state = {
            filters: { country: 'CO', selected: ['UHD', 'FHD'], enabled: true },
            lab: Array.from({ length: 12 }, (_, i) => ({ id: `P${i / 2}`, metadata: { order: i } }))
        };
        await manager.saveAppState('durable-state', state);
        check('application state round-trips including all 12 profile IDs',
            JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));

        // ── Catálogo y caché comparten el store; la clave física es serverId::id.
        const serverA = 'https://provider-a.invalid';
        const serverB = 'https://provider-b.invalid';
        const legacy = { id: 'legacy-plain', serverUrl: serverB, name: 'Legacy row without composite key' };
        await putNative('channels', legacy);
        check('loadChannels reads a legacy row (plain id, no _channelId) unchanged',
            JSON.stringify(await manager.loadChannels()) === JSON.stringify([legacy]));

        const channelA1 = { id: '1', serverId: 'A', url: serverA + '/live/u/p/1.ts', name: 'A1', codecFamily: 'HEVC' };
        check('saveChannels keeps its successful return value', await manager.saveChannels([channelA1], serverA) === true);
        const rowA1 = await nativeGet('channels', 'A::1');
        check('saveChannels persists the physical key serverId::id with the canonical id in _channelId',
            rowA1 && rowA1._channelId === '1' && rowA1.serverId === 'A' && rowA1.url === channelA1.url);
        const restoredA1 = (await manager.loadChannels()).find(ch => ch.id === '1');
        check('loadChannels restores the canonical id and full fields',
            restoredA1 && restoredA1.serverId === 'A' && restoredA1.url === channelA1.url && !('_channelId' in restoredA1));

        const channelA2 = { id: '2', serverId: 'A', url: serverA + '/live/u/p/2.ts', name: 'A2', codecFamily: 'HEVC' };
        await manager.saveChannelsBulk([channelA2], serverA);
        const rowA2 = await nativeGet('channels', 'A::2');
        check('saveChannelsBulk stores ONE complete row (url/serverId) per channel',
            rowA2 && rowA2.url === channelA2.url && rowA2.serverId === 'A' && rowA2._channelId === '2');
        check('after both writes the catalog holds the legacy, saved and bulk rows',
            view(await manager.loadChannels()).join('|') === ['A:1', 'A:2', ':legacy-plain'].sort().join('|'));

        const cacheMap = await manager.getCachedMetadata();
        check('cache reads a real Map keyed by the canonical id and preserves the full row',
            cacheMap instanceof Map && cacheMap.size === 3 &&
            cacheMap.get('2').url === channelA2.url && cacheMap.has('legacy-plain'));

        const sharedA = { id: '7', serverId: 'A', url: serverA + '/live/u/p/7.ts', name: 'Shared A' };
        const sharedB = { id: '7', serverId: 'B', url: serverB + '/live/u/p/7.ts', name: 'Shared B' };
        await manager.saveChannels([sharedA, sharedB]);
        const withShared = await manager.loadChannels();
        check('two servers with the SAME stream_id survive as two rows with their original ids',
            withShared.filter(ch => ch.id === '7').length === 2 &&
            withShared.find(ch => ch.id === '7' && ch.serverId === 'A').url === sharedA.url &&
            withShared.find(ch => ch.id === '7' && ch.serverId === 'B').url === sharedB.url);
        check('the physical keys of the two providers do not collide',
            (await nativeGet('channels', 'A::7')) && (await nativeGet('channels', 'B::7')));

        const shortcut = await manager.getCachedMetadata([{ id: '7', serverId: 'A' }], 'A');
        check('cache shortcut reads only the requested server and returns its canonical id',
            shortcut.size === 1 && shortcut.get('7') && shortcut.get('7').name === 'Shared A');

        const legacyShortcut = await manager.getCachedMetadata([{ id: 'legacy-plain' }]);
        check('cache shortcut falls back to the legacy plain key',
            legacyShortcut.size === 1 && legacyShortcut.has('legacy-plain'));

        // ── Abortos nativos: ninguna operación puede resolver como si hubiera guardado.
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
        await withAbort(() => rejects('saveChannels rejects a native abort', manager.saveChannels([{ id: 'aborted-channel', serverId: 'A' }]), ['AbortError']));
        await withAbort(() => rejects('saveChannelsBulk rejects a native abort', manager.saveChannelsBulk([{ id: 'aborted-bulk', serverId: 'A' }], serverA), ['AbortError']));

        const nativeGetProto = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (...args) {
            const req = nativeGetProto.apply(this, args);
            req.addEventListener('success', () => req.transaction.abort(), { once: true });
            return req;
        };
        try {
            await rejects('getAppState waits for transaction completion', manager.getAppState('durable-state'), ['AbortError']);
        } finally { IDBObjectStore.prototype.get = nativeGetProto; }

        const nativeCursor = IDBObjectStore.prototype.openCursor;
        IDBObjectStore.prototype.openCursor = function (...args) {
            const req = nativeCursor.apply(this, args);
            req.addEventListener('success', () => { if (req.result === null) req.transaction.abort(); });
            return req;
        };
        try {
            await rejects('getCachedMetadata rejects transaction abort even after the final cursor result', manager.getCachedMetadata(), ['AbortError']);
        } finally { IDBObjectStore.prototype.openCursor = nativeCursor; }

        // Un error nativo de request se observa en la transacción; aquí basta
        // con cubrir el aborto real y los errores de clonado que lanzan los put.

        await rejects('saveAppState exposes a clone error', manager.saveAppState('durable-state', () => {}), ['DataCloneError']);
        const catalogBeforeFailures = view(await manager.loadChannels());
        await rejects('saveChannels exposes a clone error and rolls back the preceding row',
            manager.saveChannels([{ id: 'partial', serverId: 'A' }, { id: 'invalid', serverId: 'A', bad: () => {} }]), ['DataCloneError']);
        await rejects('saveChannelsBulk exposes a clone error and rolls back the preceding row',
            manager.saveChannelsBulk([{ id: 'partial-bulk', serverId: 'A' }, { id: 'invalid-bulk', serverId: 'A', bad: () => {} }], serverA), ['DataCloneError']);
        check('failed catalog writes preserve the committed complete catalog',
            view(await manager.loadChannels()).join('|') === catalogBeforeFailures.join('|'));

        // ── replaceChannels: reemplazo exacto en una sola transacción.
        const makeA = (start, count) => Array.from({ length: count }, (_, offset) => ({
            id: String(start + offset), serverId: 'A', serverUrl: serverA,
            url: `${serverA}/live/u/p/${start + offset}.ts`, name: `A${start + offset}`
        }));
        const makeB = (start, count) => Array.from({ length: count }, (_, offset) => ({
            id: String(start + offset), serverId: 'B', serverUrl: serverB,
            url: `${serverB}/live/u/p/${start + offset}.ts`, name: `B${start + offset}`
        }));
        await putNative('channels', { id: 'retired', serverId: 'A', serverUrl: serverA, name: 'Retired row' });
        const replacement = [...makeA(10, 10), ...makeB(1, 5)];
        const replacedCount = await manager.replaceChannels(replacement);
        check('replaceChannels returns the exact number of persisted channels', replacedCount === 15);
        check('replaceChannels leaves exactly the requested catalog and removes retired/bulk rows',
            view(await manager.loadChannels()).join('|') === view(replacement).join('|'));
        check('replaceChannels keeps the physical composite keys',
            (await nativeGet('channels', 'A::10')) && (await nativeGet('channels', 'B::1')));
        await withAbort(() => rejects('replaceChannels rejects a native abort', manager.replaceChannels([]), ['Error', 'AbortError']));
        check('aborted replacement keeps the previous catalog intact',
            view(await manager.loadChannels()).join('|') === view(replacement).join('|'));

        // ── Limpieza por servidor: aislada, contada y sin tocar al otro proveedor.
        const beforeServerClear = await manager.loadChannels();
        check('server clear reports the authoritative catalog count', await manager.clearChannelsByServer(serverA) === 10);
        const afterServerClear = await manager.loadChannels();
        check('server clear preserves the other server despite overlapping stream IDs',
            view(afterServerClear).join('|') === view(replacement.filter(ch => ch.serverId === 'B')).join('|'));
        check('server clear updates cache and catalog together',
            (await manager.getCachedMetadata()).size === 5);
        check('server clear preserves unrelated application state',
            JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));

        await manager.replaceChannels([
            { id: '1', serverId: 'A', serverUrl: 'https://shared.invalid/one/', name: 'shared one' },
            { id: '2', serverId: 'B', serverUrl: 'https://shared.invalid/two/', name: 'shared two' }
        ]);
        await manager.clearChannelsByServer('https://shared.invalid/one/');
        check('server clear distinguishes different paths on the same host',
            view(await manager.loadChannels()).join('|') === 'B:2');

        await manager.replaceChannels(replacement.filter(ch => ch.serverId === 'B'));
        await withAbort(() => rejects('clearChannelsByServer rejects a native abort', manager.clearChannelsByServer(serverB), ['AbortError']));
        check('aborted server clear restores the catalog', (await manager.loadChannels()).length === 5);

        await withAbort(() => rejects('clearChannels rejects a native abort', manager.clearChannels(), ['AbortError']));
        check('aborted channel clear restores the catalog', (await manager.loadChannels()).length === 5);
        await manager.clearChannels();
        check('channel clear empties the catalog and the cache together',
            (await manager.loadChannels()).length === 0 && (await manager.getCachedMetadata()).size === 0);
        check('channel clear preserves unrelated configuration',
            JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));

        // ── clearAll: los tres stores, todo o nada.
        await manager.replaceChannels([{ id: '9', serverId: 'A', serverUrl: serverA, name: 'fixture' }]);
        await putNative('servers', { url: serverB, name: 'Server fixture' });
        await withAbort(() => rejects('clearAll rejects a native abort', manager.clearAll(), ['AbortError']));
        check('aborted full clear preserves every store',
            (await manager.loadChannels()).length === 1 && await countStore('servers') === 1 &&
            JSON.stringify(await manager.getAppState('durable-state')) === JSON.stringify(state));
        await manager.clearAll();
        check('authorized full clear commits all three stores together',
            await countStore('channels') === 0 && await countStore('servers') === 0 && await countStore('app_state') === 0);

        // Estado de partida para el chequeo de recarga real.
        await manager.saveAppState('durable-state', state);
        await manager.saveChannels([
            { id: '1', serverId: 'A', serverUrl: serverA, url: serverA + '/live/u/p/1.ts', name: 'Reload A1' },
            { id: '1', serverId: 'B', serverUrl: serverB, url: serverB + '/live/u/p/1.ts', name: 'Reload B1' }
        ]);
        await manager.saveChannelsBulk([
            { id: '2', serverId: 'A', serverUrl: serverA, url: serverA + '/live/u/p/2.ts', name: 'Reload A2' }
        ], serverA);
        check('reload fixtures are persisted before the real page reload',
            (await manager.loadChannels()).length === 3);
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
        const view = list => (list || []).map(ch => `${ch.serverId || ''}:${ch.id}`).sort();

        const restored = await manager.getAppState('durable-state');
        check('application state and 12 profiles survive page reload',
            restored.filters.country === 'CO' && restored.lab.length === 12 && restored.lab[11].id === 'P5.5');
        const catalog = await manager.loadChannels();
        check('both servers with the same stream_id survive a real page reload',
            view(catalog).join('|') === ['A:1', 'A:2', 'B:1'].join('|') &&
            catalog.every(ch => typeof ch.url === 'string' && ch.url.length > 0));
        check('the complete catalog is still reachable as a metadata Map',
            (await manager.getCachedMetadata()).has('1') && (await manager.getCachedMetadata()).has('2'));

        await manager.replaceChannels([]);
        check('an empty authoritative catalog survives reload without resurrecting old rows',
            (await manager.loadChannels()).length === 0 && (await manager.getCachedMetadata()).size === 0);

        // Abrir en versión anterior produce un onblocked real; cerrarla después no
        // puede permitir que una apertura ya rechazada actualice en segundo plano.
        const blocker = await open(manager.dbName, 1);
        manager.db.close();
        manager._opening = null;
        manager.dbVersion = 2;
        let opening;
        const nativeOpen = IDBFactory.prototype.open;
        indexedDB.open = function (...args) {
            opening = nativeOpen.apply(this, args);
            return opening;
        };
        const readyPromise = manager.ready();
        // openDB() se ejecuta de forma síncrona dentro de ready(); el request ya
        // está disponible para observar el desenlace tardío del bloqueo.
        const lateResult = new Promise(resolve => {
            opening.addEventListener('success', () => resolve('success'));
            opening.addEventListener('error', () => resolve(opening.error && opening.error.name));
        });
        let blockedError;
        try { await bounded(readyPromise); } catch (error) { blockedError = error; }
        delete indexedDB.open;
        check('ready rejects an actual blocked opening promptly', blockedError && blockedError.name === 'InvalidStateError');
        blocker.close();
        check('late opening is aborted after blocked rejection', await bounded(lateResult) === 'AbortError');
        const unchanged = await bounded(open(manager.dbName, 1));
        check('blocked opening leaves database version and stores unchanged',
            unchanged.version === 1 && unchanged.objectStoreNames.length === 3);
        unchanged.close();

        const newer = await bounded(open(manager.dbName, 2));
        newer.close();
        manager._opening = null;
        manager.dbVersion = 1;
        let versionError;
        try { await bounded(manager.ready()); } catch (error) { versionError = error; }
        check('ready rejects a native open VersionError', versionError && versionError.name === 'VersionError');

        manager.db = null;
        manager._opening = null;
        manager.dbVersion = 2;
        await manager.ready();
        check('ready reopens after a closed connection and state is still readable',
            (await manager.getAppState('durable-state')) !== null);
        return rows;
    }

    const cases = { transactionChecks, lifecycleChecks };
    if (typeof module !== 'undefined' && module.exports) module.exports = cases;
    else root.DatabaseManagerBrowserCases = cases;
})(typeof window !== 'undefined' ? window : globalThis);
