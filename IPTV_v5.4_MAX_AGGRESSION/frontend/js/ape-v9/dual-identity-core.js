/**
 * ══════════════════════════════════════════════════════════════════════
 *  DUAL IDENTITY CORE [OMEGA CRYSTAL V5] — MODULE
 * ══════════════════════════════════════════════════════════════════════
 * Encargado de la lógica matemática para la Identidad Dual:
 * _sid (Idempotente vía FNV32 Hash)
 * _nonce (Generador polimórfico random string)
 */

(function(global) {
    'use strict';

    class DualIdentityCore {
        constructor() {
            this.version = 'v5.0.OMEGA';
            this.seed = 'OMEGA_STATIC_SEED_V5';
            this._generateRandomString = this._generateRandomString.bind(this);
            this.dbName = 'APE_DualIdentity_DB';
            this.storeName = 'identities';
            this.db = null;
            this.identityCache = new Map();
        }

        async init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'idToHash' });
                    }
                };
                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    this._loadCache().then(() => {
                        console.log('[DUAL IDENTITY CORE] IndexedDB Enterprise Ready. Cached:', this.identityCache.size);
                        resolve();
                    });
                };
                req.onerror = () => reject('DualIdentity IndexedDB init failed');
            });
        }

        async _loadCache() {
            return new Promise((resolve) => {
                if (!this.db) return resolve();
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.getAll();
                req.onsuccess = () => {
                    req.result.forEach(item => {
                        this.identityCache.set(item.idToHash, item);
                    });
                    resolve();
                };
                req.onerror = () => resolve();
            });
        }

        async _saveIdentity(item) {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(item);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject();
            });
        }

        _hashFNV32(str) {
            let h = 0x811c9dc5;
            for (let i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = (h * 0x01000193) >>> 0;
            }
            const h2 = (h ^ (h >>> 16)) >>> 0;
            return (h.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0')).substring(0,16);
        }

        _generateRandomString(length) {
            const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let res = "";
            for (let i = 0; i < length; i++) {
                res += charset.charAt(Math.floor(Math.random() * charset.length));
            }
            return res;
        }

        /**
         * Ejecuta la generación y retorna el objeto con ambas identidades
         * Utiliza la RAM cache (sincronizado) y auto-persiste asíncronamente en IDB
         * @param {Object} channel Objeto de canal normalizado Frontend
         * @param {number} fallbackIndex Índice de fallback numérico por lista
         */
        generateTokens(channel, fallbackIndex = 0) {
            const idToHash = (channel && typeof channel === 'object') ? (channel.stream_id || channel.id || fallbackIndex) : fallbackIndex;
            
            // Check in-memory cache for stable nonce
            if (this.identityCache.has(idToHash)) {
                return this.identityCache.get(idToHash);
            }

            const sid = this._hashFNV32(String(idToHash) + this.seed);
            const identity = {
                idToHash: idToHash,
                sid: sid,
                nonce: this._generateRandomString(8),
                reqId: `REQ_${this._generateRandomString(16)}`,
                sessionId: `SES_${this._generateRandomString(16)}`,
                establishedAt: Date.now()
            };

            // Guarda cache y dispara I/O
            this.identityCache.set(idToHash, identity);
            this._saveIdentity(identity).catch(e => console.warn('Failed DualIdentity I/O', e));

            return identity;
        }
    }

    const instance = new DualIdentityCore();
    // Inicia silenciosamente para pre-llenar antes del streaming
    instance.init().catch(e => console.warn(e));
    
    global.DualIdentity = instance;
    console.log('[DUAL IDENTITY CORE] v5.0.OMEGA + IndexedDB Activo');

})(typeof window !== 'undefined' ? window : this);
