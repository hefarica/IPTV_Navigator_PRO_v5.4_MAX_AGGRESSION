/**
 * IPTV Navigator PRO v4.0 - Database Manager
 * Capa de persistencia local optimizada usando IndexedDB
 * Permite manejar grandes volúmenes de canales sin bloquear el UI
 */

class DatabaseManager {
    constructor() {
        this.dbName = 'IPTVNavigatorDB';
        this.dbVersion = 1;
        this.channelsSnapshotKey = 'channelsListSnapshot';
        this.db = null;
        this.initPromise = this.openDB();
    }

    /**
     * Abre conexión a IndexedDB
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                console.error('DatabaseManager: Error al abrir BD', error);
                reject(error);
            };

            request.onerror = (event) => {
                fail(event.target.error);
            };

            request.onblocked = () => {
                fail(new DOMException(
                    'La base de datos está bloqueada por otra pestaña. Cierra esa pestaña y vuelve a intentar.',
                    'InvalidStateError'
                ));
            };

            request.onupgradeneeded = (event) => {
                // Una apertura bloqueada ya se notificó al llamador. No completar
                // una actualización tardía después de haber rechazado ready().
                if (settled) {
                    event.target.transaction.abort();
                    return;
                }
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
                if (settled) {
                    event.target.result.close();
                    return;
                }
                settled = true;
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
            return await new Promise((resolve, reject) => {
                const tx = this.db.transaction(['app_state', 'channels'], 'readonly');
                let channels = [];
                tx.oncomplete = () => resolve(channels);
                tx.onerror = (event) => reject(tx.error || event.target.error);
                tx.onabort = () => reject(tx.error || new DOMException('Lectura del catálogo abortada', 'AbortError'));
                const snapshot = tx.objectStore('app_state').get(this.channelsSnapshotKey);
                snapshot.onsuccess = () => {
                    if (snapshot.result) {
                        // [] también es un catálogo guardado: no resucitar filas
                        // antiguas de la caché después de vaciar la lista.
                        if (!Array.isArray(snapshot.result.value)) {
                            tx.abort();
                            reject(new DOMException('El catálogo guardado no es una lista', 'DataError'));
                            return;
                        }
                        channels = snapshot.result.value;
                    } else {
                        // Compatibilidad sin migración: sólo antes del primer
                        // snapshot se recupera el almacenamiento anterior.
                        const legacy = tx.objectStore('channels').getAll();
                        legacy.onsuccess = () => { channels = legacy.result || []; };
                    }
                };
            });
        } catch (e) {
            console.error("loadChannels error", e);
            return [];
        }
    }

    async saveChannels(list) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('app_state', 'readwrite');
            tx.oncomplete = () => resolve(true);
            tx.onerror = (event) => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Guardado de canales abortado', 'AbortError'));
            try {
                if (!Array.isArray(list)) throw new TypeError('El catálogo de canales debe ser una lista');
                // Conservar la validación previa de id sin convertirlo ni usarlo
                // como clave global: servidores distintos pueden compartirlo.
                list.forEach(item => indexedDB.cmp(item && item.id, item && item.id));
                // El catálogo completo es autoritativo y se reemplaza de forma
                // atómica. El store channels conserva su caché de metadatos.
                tx.objectStore('app_state').put({ key: this.channelsSnapshotKey, value: list });
            } catch (error) {
                // Si un put falla antes de terminar el lote, no confirmar los
                // anteriores como un guardado parcial ni ocultar el error.
                try { tx.abort(); } catch (_) { /* Puede haberse abortado ya. */ }
                reject(error);
            }
        });
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
            transaction.onabort = () => reject(transaction.error || new DOMException('Guardado de metadatos abortado', 'AbortError'));

            const now = Date.now();

            try {
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
            } catch (error) {
                try { transaction.abort(); } catch (_) { /* Puede haberse abortado ya. */ }
                reject(error);
            }
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
            transaction.oncomplete = () => resolve(resultMap);
            transaction.onerror = (event) => reject(transaction.error || event.target.error);
            transaction.onabort = () => reject(transaction.error || new DOMException('Lectura de metadatos abortada', 'AbortError'));

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
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['app_state'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = (event) => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Guardado del estado abortado', 'AbortError'));
            tx.objectStore('app_state').put({ key, value });
        });
    }

    /**
     * Carga estado de la aplicación
     */
    async getAppState(key) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['app_state'], 'readonly');
            let value = null;
            tx.oncomplete = () => resolve(value);
            tx.onerror = (event) => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Lectura del estado abortada', 'AbortError'));
            const req = tx.objectStore('app_state').get(key);
            req.onsuccess = () => { value = req.result ? req.result.value : null; };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Limpia toda la base de datos
     */
    async clearAll() {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels', 'servers', 'app_state'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = (event) => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Limpieza de la base abortada', 'AbortError'));
            tx.objectStore('channels').clear();
            tx.objectStore('servers').clear();
            tx.objectStore('app_state').clear();
        });
    }

    /**
     * V4.8.3: Limpia solo los canales (mantiene configuración)
     */
    async clearChannels() {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels', 'app_state'], 'readwrite');
            tx.oncomplete = () => {
                console.log('🗑️ IndexedDB: Canales limpiados');
                resolve();
            };
            tx.onerror = (e) => reject(e.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Limpieza de canales abortada', 'AbortError'));
            tx.objectStore('channels').clear();
            tx.objectStore('app_state').put({ key: this.channelsSnapshotKey, value: [] });
        });
    }

    /**
     * V4.8.3: Limpia canales de un servidor específico
     * @param {string} serverUrl - URL del servidor a limpiar
     */
    async clearChannelsByServer(serverUrl) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels', 'app_state'], 'readwrite');
            const store = tx.objectStore('channels');
            const stateStore = tx.objectStore('app_state');
            const normalizeServer = value => typeof value === 'string'
                ? value.replace(/\/+$/, '').replace(/\/player_api\.php$/i, '').replace(/\/+$/, '') : '';
            const target = normalizeServer(serverUrl);
            // Una identidad vacía nunca autoriza limpiar canales sin procedencia.
            if (!target) {
                tx.abort();
                reject(new DOMException('Se requiere la URL del servidor', 'DataError'));
                return;
            }

            let cachedDeleted = 0;
            let snapshotDeleted = null;
            tx.oncomplete = () => {
                const deleted = snapshotDeleted === null ? cachedDeleted : snapshotDeleted;
                console.log(`🗑️ IndexedDB: ${deleted} canales del servidor eliminados`);
                resolve(deleted);
            };
            tx.onerror = (event) => reject(tx.error || event.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Limpieza del servidor abortada', 'AbortError'));

            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (normalizeServer(cursor.value.serverUrl) === target) {
                        cursor.delete();
                        cachedDeleted++;
                    }
                    cursor.continue();
                }
            };

            const values = {};
            let remaining = 3;
            const updateSnapshot = () => {
                if (--remaining > 0 || !values[this.channelsSnapshotKey]) return;
                const snapshot = values[this.channelsSnapshotKey].value;
                if (!Array.isArray(snapshot)) {
                    tx.abort();
                    reject(new DOMException('El catálogo guardado no es una lista', 'DataError'));
                    return;
                }
                const active = values.activeServers && values.activeServers.value;
                const library = values.serverLibrary && values.serverLibrary.value;
                const servers = [
                    ...((active && Array.isArray(active.activeServers)) ? active.activeServers : []),
                    ...((active && active.currentServer) ? [active.currentServer] : []),
                    ...(Array.isArray(library) ? library : [])
                ];
                const serverIds = new Set(servers.filter(server =>
                    server && normalizeServer(server.baseUrl || server.url) === target
                ).map(server => server.id).filter(id => id !== undefined && id !== null));
                const kept = snapshot.filter(channel => !(
                    serverIds.has(channel.serverId || channel._serverId) ||
                    normalizeServer(channel.serverUrl || channel._serverUrl) === target
                ));
                snapshotDeleted = snapshot.length - kept.length;
                stateStore.put({ key: this.channelsSnapshotKey, value: kept });
            };
            [this.channelsSnapshotKey, 'activeServers', 'serverLibrary'].forEach(key => {
                const get = stateStore.get(key);
                get.onsuccess = () => { values[key] = get.result; updateSnapshot(); };
            });
        });
    }
}

// Exportar
if (typeof window !== 'undefined') {
    window.dbManager = new DatabaseManager();
}
