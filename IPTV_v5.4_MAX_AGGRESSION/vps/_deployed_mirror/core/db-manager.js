/**
 * IPTV Navigator PRO v4.0 - Database Manager
 * Capa de persistencia local optimizada usando IndexedDB
 * Permite manejar grandes volúmenes de canales sin bloquear el UI
 */

class DatabaseManager {
    constructor() {
        this.dbName = 'IPTVNavigatorDB';
        this.dbVersion = 1;
        this.db = null;
        this.initPromise = this.openDB();
    }

    /**
     * Abre conexión a IndexedDB
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('DatabaseManager: Error al abrir BD', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store: Canales Enriquecidos (Caché masivo)
                if (!db.objectStoreNames.contains('channels')) {
                    const channelStore = db.createObjectStore('channels', { keyPath: 'id' });
                    channelStore.createIndex('serverUrl', 'serverUrl', { unique: false });
                    channelStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Store: Configuración de Servidores
                if (!db.objectStoreNames.contains('servers')) {
                    db.createObjectStore('servers', { keyPath: 'url' });
                }

                // Store: Estado de la App
                if (!db.objectStoreNames.contains('app_state')) {
                    db.createObjectStore('app_state', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ DatabaseManager: IndexedDB conectado');
                resolve(this.db);
            };
        });
    }

    /**
     * Espera a que la BD esté lista
     */
    async ready() {
        return this.initPromise;
    }

    // 🟢 FIX: Compatibilidad con llamadas legacy
    async loadChannels() {
        try {
            await this.ready(); // Ensure DB is open
            const tx = this.db.transaction('channels', 'readonly');
            const store = tx.objectStore('channels');
            return await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("loadChannels error", e);
            return [];
        }
    }

    async saveChannels(list) {
        try {
            await this.ready();
            const tx = this.db.transaction('channels', 'readwrite');
            const store = tx.objectStore('channels');
            list.forEach(item => store.put(item));
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.error("saveChannels error", e);
        }
    }

    /**
     * Genera ID único para un canal basado en sus propiedades inmutables
     */
    generateChannelId(channel) {
        // Usamos TVG-ID o URL del stream como identificador único
        // Preferimos TVG-ID + Nombre para consistencia entre sesiones
        if (channel.tvg_id && channel.tvg_id !== '') {
            return `tvg:${channel.tvg_id}`;
        }
        // Fallback: Hash simple de la URL (solo path) + nombre
        const str = (channel.url || '') + (channel.name || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir a 32bit integer
        }
        return `hash:${hash}`;
    }

    /**
     * Guarda un lote de canales en transaccion
     * @param {Array} channels - Lista de canales a guardar
     * @param {String} serverUrl - Origen de los canales
     */
    async saveChannelsBulk(channels, serverUrl) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['channels'], 'readwrite');
            const store = transaction.objectStore('channels');

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);

            const now = Date.now();

            channels.forEach(ch => {
                const id = this.generateChannelId(ch);
                // Solo guardamos metadatos esenciales para cache
                const entry = {
                    id: id,
                    serverUrl: serverUrl,
                    updatedAt: now,

                    // Datos enriquecidos a cachear
                    qualityTags: ch.qualityTags,
                    transportFormatCode: ch.transportFormatCode,
                    codecFamily: ch.codecFamily,
                    avgBitrateKbps: ch.avgBitrateKbps,
                    bitrateTierCode: ch.bitrateTierCode,

                    // Metadata base
                    tvg_id: ch.tvg_id,
                    name: ch.name,
                    logo: ch.logo
                };
                store.put(entry);
            });
        });
    }

    /**
     * Recupera metadatos cacheados para una lista de canales crudos
     * @param {Array} rawChannels 
     * @returns {Promise<Map>} Map con ID -> Datos Cacheados
     */
    async getCachedMetadata(rawChannels) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['channels'], 'readonly');
            const store = transaction.objectStore('channels');
            const resultMap = new Map();

            // Optimización: Si son muchos, mejor abrir cursor o usar getAll si es posible.
            // Dado que IndexedDB no tiene "getMany", y necesitamos IDs específicos,
            // haremos una estrategia de "best effort" parallel gets para bloques o un cursor total si son muchos.

            // Estrategia simplificada para demo:
            // Si hay muchos canales, es más rápido leer todo el store en memoria si no es gigante,
            // o iterar. Para 10k canales, un cursor es mejor.

            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    resultMap.set(cursor.value.id, cursor.value);
                    cursor.continue();
                } else {
                    resolve(resultMap);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Guarda estado de la aplicación
     */
    async saveAppState(key, value) {
        await this.ready();
        const tx = this.db.transaction(['app_state'], 'readwrite');
        tx.objectStore('app_state').put({ key, value });
        return new Promise(resolve => {
            tx.oncomplete = () => resolve();
        });
    }

    /**
     * Carga estado de la aplicación
     */
    async getAppState(key) {
        await this.ready();
        return new Promise((resolve) => {
            const req = this.db.transaction(['app_state']).objectStore('app_state').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => resolve(null);
        });
    }

    /**
     * Limpia toda la base de datos
     */
    async clearAll() {
        await this.ready();
        const tx = this.db.transaction(['channels', 'servers', 'app_state'], 'readwrite');
        tx.objectStore('channels').clear();
        tx.objectStore('servers').clear();
        tx.objectStore('app_state').clear();
        return new Promise(resolve => tx.oncomplete = () => resolve());
    }

    /**
     * V4.8.3: Limpia solo los canales (mantiene configuración)
     */
    async clearChannels() {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels'], 'readwrite');
            tx.objectStore('channels').clear();
            tx.oncomplete = () => {
                console.log('🗑️ IndexedDB: Canales limpiados');
                resolve();
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * V4.8.3: Limpia canales de un servidor específico
     * @param {string} serverUrl - URL del servidor a limpiar
     */
    async clearChannelsByServer(serverUrl) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels'], 'readwrite');
            const store = tx.objectStore('channels');
            const index = store.index('serverUrl');
            const request = index.openCursor(IDBKeyRange.only(serverUrl));

            let deleted = 0;
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deleted++;
                    cursor.continue();
                }
            };

            tx.oncomplete = () => {
                console.log(`🗑️ IndexedDB: ${deleted} canales de ${serverUrl} eliminados`);
                resolve(deleted);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }
}

// Exportar
if (typeof window !== 'undefined') {
    window.dbManager = new DatabaseManager();
}
