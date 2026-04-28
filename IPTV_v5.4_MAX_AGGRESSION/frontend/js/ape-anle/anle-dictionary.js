/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Dictionary (IndexedDB Wrapper)
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Separate IndexedDB database: IPTVNavigatorANLE_DB
 * The existing IPTVNavigatorDB is NEVER touched.
 *
 * Stores:
 *   - aliases: { id, canonical, variants[], country, languages[], categories[], weight, source }
 *   - fingerprints: { serverId, prefixes, separators, groupPatterns, ... }
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};
    const DB_NAME = 'IPTVNavigatorANLE_DB';
    const DB_VERSION = 1;

    const dict = {
        _db: null,

        /**
         * Open (or create) the ANLE database.
         * @returns {Promise<IDBDatabase>}
         */
        async open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;

                    // ALIASES store
                    if (!db.objectStoreNames.contains('aliases')) {
                        const aliasStore = db.createObjectStore('aliases', { keyPath: 'id' });
                        aliasStore.createIndex('canonical', 'canonical', { unique: false });
                        aliasStore.createIndex('variants', 'variants', { unique: false, multiEntry: true });
                        aliasStore.createIndex('source', 'source', { unique: false });
                    }

                    // FINGERPRINTS store
                    if (!db.objectStoreNames.contains('fingerprints')) {
                        db.createObjectStore('fingerprints', { keyPath: 'serverId' });
                    }
                };

                req.onsuccess = () => {
                    this._db = req.result;
                    resolve(this._db);
                };

                req.onerror = () => reject(req.error);
            });
        },

        /**
         * Put a single alias entry (upsert).
         * Automatically canonicalizes variants before storage.
         * @param {Object} entry - { id, canonical, variants[], weight, ... }
         * @returns {Promise<boolean>}
         */
        async putAlias(entry) {
            await this.open();
            // Pre-canonicalize variants for index matching
            const normalized = {
                ...entry,
                variants: (entry.variants || []).map(v => ANLE.canonicalize(v))
                    .filter(v => v.length > 0)
            };
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('aliases', 'readwrite');
                tx.objectStore('aliases').put(normalized);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        },

        /**
         * Get alias by ID.
         * @param {string} id
         * @returns {Promise<Object|null>}
         */
        async getAlias(id) {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('aliases', 'readonly');
                const req = tx.objectStore('aliases').get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        },

        /**
         * Query alias by variant (uses multiEntry index).
         * Returns the first matching alias entry.
         * @param {string} variantRaw - Raw variant string (will be canonicalized)
         * @returns {Promise<Object|null>}
         */
        async queryByVariant(variantRaw) {
            await this.open();
            const variant = ANLE.canonicalize(variantRaw);
            if (!variant) return null;

            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('aliases', 'readonly');
                const idx = tx.objectStore('aliases').index('variants');
                const req = idx.openCursor(IDBKeyRange.only(variant));
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    resolve(cursor ? cursor.value : null);
                };
                req.onerror = () => reject(req.error);
            });
        },

        /**
         * Bulk put aliases (transactional).
         * @param {Array<Object>} entries
         * @returns {Promise<number>} count inserted
         */
        async putAliasBulk(entries) {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('aliases', 'readwrite');
                const store = tx.objectStore('aliases');
                let count = 0;

                for (const entry of entries) {
                    const normalized = {
                        ...entry,
                        variants: (entry.variants || []).map(v => ANLE.canonicalize(v))
                            .filter(v => v.length > 0)
                    };
                    store.put(normalized);
                    count++;
                }

                tx.oncomplete = () => resolve(count);
                tx.onerror = () => reject(tx.error);
            });
        },

        /**
         * Put a server fingerprint.
         * @param {Object} fp - { serverId, prefixes, separators, ... }
         * @returns {Promise<boolean>}
         */
        async putFingerprint(fp) {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('fingerprints', 'readwrite');
                tx.objectStore('fingerprints').put(fp);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        },

        /**
         * Get server fingerprint by serverId.
         * @param {string} serverId
         * @returns {Promise<Object|null>}
         */
        async getFingerprint(serverId) {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('fingerprints', 'readonly');
                const req = tx.objectStore('fingerprints').get(serverId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        },

        /**
         * Get all fingerprints.
         * @returns {Promise<Array<Object>>}
         */
        async getAllFingerprints() {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('fingerprints', 'readonly');
                const req = tx.objectStore('fingerprints').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        },

        /**
         * Get counts for aliases and fingerprints stores.
         * @returns {Promise<{aliases: number, fingerprints: number}>}
         */
        async stats() {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction(['aliases', 'fingerprints'], 'readonly');
                const aReq = tx.objectStore('aliases').count();
                const fReq = tx.objectStore('fingerprints').count();
                tx.oncomplete = () => resolve({
                    aliases: aReq.result,
                    fingerprints: fReq.result
                });
                tx.onerror = () => reject(tx.error);
            });
        },

        /**
         * Delete all entries with source === 'learned' (keep seeds).
         * @returns {Promise<number>} count deleted
         */
        async clearLearned() {
            await this.open();
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction('aliases', 'readwrite');
                const store = tx.objectStore('aliases');
                const idx = store.index('source');
                const req = idx.openCursor(IDBKeyRange.only('learned'));
                let deleted = 0;

                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        cursor.delete();
                        deleted++;
                        cursor.continue();
                    }
                };

                tx.oncomplete = () => resolve(deleted);
                tx.onerror = () => reject(tx.error);
            });
        }
    };

    ANLE.dictionary = dict;
    console.log('🧬 [ANLE] dictionary loaded');
})();
