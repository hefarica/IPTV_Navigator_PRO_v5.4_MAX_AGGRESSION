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
        this._opening = null;
        this.initPromise = this.openDB().catch(() => null);
        // La apertura eager también es single-flight: si ready() llega antes de
        // que el navegador responda, espera esta misma promesa en vez de abrir
        // una segunda conexión (origen de los InvalidStateError).
        this._opening = this.initPromise;
    }

    /**
     * V4.34: CLAVE FÍSICA DEL STORE = `serverId::id`.
     *
     * `id` es el id canónico del canal (el `stream_id` de Xtream) y NO es único
     * entre servidores: dos proveedores pueden usar el mismo `stream_id`. El
     * store tiene keyPath `id`, así que al guardar por `id` el canal de un
     * servidor SOBRESCRIBÍA al de otro (misma primary key) y al refrescar
     * faltaban canales: la app "cargaba mal" aunque el servidor estuviera
     * conectado. Se persiste la fila con la clave compuesta y el id original en
     * `_channelId`; `_restoreRow()` lo devuelve al leer, de modo que el resto de
     * la app sigue viendo exactamente el mismo canal (mismo `id`).
     */
    _persistRow(channel, serverUrl, now) {
        if (!channel || typeof channel !== 'object') return null;
        const row = Object.assign({}, channel);
        let id = (channel.id === undefined || channel.id === null || channel.id === '')
            ? ''
            : String(channel.id);
        if (!id) id = this.generateChannelId(channel);
        if (!id) return null;
        const serverId = (channel.serverId && String(channel.serverId))
            || (channel._serverId && String(channel._serverId))
            || '';
        row._channelId = id;
        row.id = serverId ? `${serverId}::${id}` : id;
        if (serverUrl !== undefined && serverUrl !== null) row.serverUrl = serverUrl;
        else if (row.serverUrl === undefined) row.serverUrl = '';
        row.updatedAt = now || channel.updatedAt || Date.now();
        return row;
    }

    /**
     * V4.34: deshace `_persistRow()` al leer. Las filas antiguas (guardadas por
     * `id` a secas, sin `_channelId`) se devuelven intactas: son legibles y la
     * migración las reescribe con la clave compuesta.
     */
    _restoreRow(row) {
        if (!row || typeof row !== 'object') return row;
        if (row._channelId !== undefined && row._channelId !== null) {
            row.id = row._channelId;
            delete row._channelId;
        }
        return row;
    }

    /**
     * ¿Sigue usable la conexión? Si el navegador la cerró, `this.db` queda
     * obsoleto y toda transacción lanza InvalidStateError.
     */
    _isAlive() {
        if (!this.db) return false;
        try {
            this.db.transaction('channels', 'readonly');
            return true;
        } catch (_) {
            this.db = null;
            return false;
        }
    }

    /**
     * Suelta la conexión si otra pestaña pide upgrade o el navegador la cierra;
     * la siguiente llamada a ready() la reabre.
     */
    _attachLifecycle(db) {
        try {
            db.onversionchange = () => {
                try { db.close(); } catch (_) { }
                if (this.db === db) this.db = null;
            };
            db.onclose = () => {
                if (this.db === db) this.db = null;
            };
        } catch (_) { /* noop */ }
    }

    /**
     * Abre conexión a IndexedDB
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                this._opening = null;
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
                this._opening = null;
                this._attachLifecycle(this.db);
                console.log('✅ DatabaseManager: IndexedDB conectado');
                resolve(this.db);
            };
        });
    }

    /**
     * Espera a que la BD esté lista
     */
    async ready() {
        if (this._isAlive()) return this.db;
        if (this._opening) return this._opening;
        // Si la conexión murió (upgrade en otra pestaña, cierre del navegador)
        // reabrimos: antes ready() devolvía una promesa ya resuelta con db = null.
        this._opening = this.openDB().catch((e) => {
            this._opening = null;
            throw e;
        });
        return this._opening;
    }

    // 🟢 FIX: Compatibilidad con llamadas legacy
    async loadChannels() {
        try {
            await this.ready(); // Ensure DB is open
            const tx = this.db.transaction('channels', 'readonly');
            const store = tx.objectStore('channels');
            return await new Promise((resolve, reject) => {
                const req = store.getAll();
                // V4.34: la fila física puede tener clave `serverId::id`; el
                // canal que consume la app conserva su `id` original.
                req.onsuccess = () => resolve((req.result || []).map((row) => this._restoreRow(row)));
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("loadChannels error", e);
            return [];
        }
    }

    async saveChannels(list, serverUrl) {
        try {
            await this.ready();
            const tx = this.db.transaction('channels', 'readwrite');
            const store = tx.objectStore('channels');
            let skipped = 0;
            (Array.isArray(list) ? list : []).forEach(item => {
                if (!item || typeof item !== 'object') { skipped++; return; }
                // V4.32: UNA ficha sin clave abortaba la transacción entera (DataError)
                // y el store se quedaba como estaba: vacío si antes se había limpiado.
                // V4.34: la clave física es serverId::id (ver _persistRow), así que
                // un canal sin `id` recibe uno derivado y dos servidores no se pisan.
                // `serverUrl` explícito evita que un guardado parcial borre el origen
                // que ya tenía la fila (y que clearChannelsByServer() busca por índice).
                const row = this._persistRow(item, serverUrl !== undefined ? serverUrl : item.serverUrl);
                if (!row) { skipped++; return; }
                store.put(row);
            });
            if (skipped > 0) console.warn(`⚠️ saveChannels: ${skipped} canales sin clave descartados`);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error || new Error('saveChannels: transacción fallida'));
                tx.onabort = () => reject(tx.error || new Error('saveChannels: transacción abortada'));
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

            // V4.33: UNA ficha por canal y COMPLETA.
            // Antes se guardaba un resumen (sin `url` ni `serverId`) con la clave
            // `tvg:...`/`hash:...`, distinta de la clave que usa saveChannels() (el
            // `id` del canal). Resultado medido en el log de la app: el mismo canal
            // quedaba DOS veces (57.310 filas para 28.655 canales) y la copia
            // resumida aparecia al recargar como "28.640 canales sin serverId
            // (0 inferidos)": sin `url` no hay forma de atribuirla a un servidor.
            (Array.isArray(channels) ? channels : []).forEach(ch => {
                if (!ch || typeof ch !== 'object') return;
                // V4.34: clave compuesta serverId::id. El canal se guarda entero
                // (url, serverId, group...) y sólo se fuerzan la clave, el origen
                // y la marca de tiempo. El id original vive en `_channelId`.
                const row = this._persistRow(ch, serverUrl, now);
                if (!row) return;
                store.put(row);
            });
        });
    }

    /**
     * Recupera metadatos cacheados para una lista de canales crudos
     * @param {Array} rawChannels 
     * @returns {Promise<Map>} Map con ID -> Datos Cacheados
     */
    /**
     * V4.34: respaldo de clave antigua. Las filas que escribieron las versiones
     * anteriores están en la base por `id` a secas (todavía sin la clave
     * `serverId::id`); si la clave compuesta no encuentra nada, se prueba esa
     * antes de dar el canal por perdido: sin esto el catálogo guardado se veía
     * "vacío" al recargar y la app volvía a descargarlo entero.
     */
    _legacyLookup(store, resultMap, plainId, requestedKey) {
        if (!plainId || plainId === requestedKey) return;
        const req = store.get(plainId);
        req.onsuccess = () => {
            if (!req.result) return;
            const row = this._restoreRow(req.result);
            resultMap.set(String(row.id), row);
        };
    }

    async getCachedMetadata(rawChannels, serverId) {
        await this.ready();
        // ── ATAJO POR CLAVE: si me dan la lista, sólo leo SUS ids ──────────
        // Antes esta función ignoraba el argumento y recorría el store ENTERO
        // con un cursor en CADA conexión de servidor: con S servidores y M
        // canales cacheados costaba S×M lecturas. Con la lista delante cuesta
        // sólo los canales de esta lista (store.get por clave primaria, una
        // sola transacción). Sin lista, o con una lista casi tan grande como
        // el store, se recorre con el cursor de siempre: igual que antes.
        // V4.34: la clave física es `serverId::id`; se consulta esa y, cuando
        // el canal no trae serverId, la clave antigua `id`.
        const _want = Array.isArray(rawChannels) ? rawChannels : null;
        let _ids = null;
        if (_want && _want.length) {
            try {
                const set = new Set();
                for (let i = 0; i < _want.length; i++) {
                    const ch = _want[i];
                    if (!ch) continue;
                    const id = (ch.id !== undefined && ch.id !== null && ch.id !== '')
                        ? String(ch.id)
                        : this.generateChannelId(ch);
                    if (!id) continue;
                    const sId = (ch.serverId && String(ch.serverId))
                        || (serverId && String(serverId)) || '';
                    set.add(sId ? `${sId}::${id}` : id);
                }
                // Umbral: por debajo compensa; por encima el cursor gana.
                if (set.size > 0 && set.size < 20000) _ids = set;
            } catch (_eIds) { _ids = null; }
        }
        if (_ids) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction(['channels'], 'readonly');
                    const store = transaction.objectStore('channels');
                    const resultMap = new Map();
                    transaction.oncomplete = () => resolve(resultMap);
                    transaction.onerror = (event) => reject(event.target.error);
                    _ids.forEach((plainId, id) => {
                        const req = store.get(id);
                        req.onsuccess = () => {
                            if (!req.result) return this._legacyLookup(store, resultMap, plainId, id);
                            const row = this._restoreRow(req.result);
                            // Clave del mapa = id lógico del canal (no la física).
                            resultMap.set(String(row.id), row);
                        };
                    });
                } catch (e) { reject(e); }
            });
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['channels'], 'readonly');
            const store = transaction.objectStore('channels');
            const resultMap = new Map();

            // Estrategia de respaldo: cursor completo sobre el store.
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const row = this._restoreRow(cursor.value);
                    resultMap.set(String(row.id), row);
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
     * V4.32: Reemplaza el catálogo en UNA sola transacción (todo o nada).
     * Antes se hacía clearChannels() y después saveChannels(): si la escritura
     * fallaba, o la página se recargaba entre las dos, IndexedDB quedaba VACÍA
     * y la app tenía que volver a descargar el catálogo entero.
     * @param {Array} list - catálogo completo tal y como debe quedar.
     * @returns {Promise<number>} cuántos canales quedaron guardados.
     */
    async replaceChannels(list) {
        await this.ready();
        const byId = new Map();
        let skipped = 0;
        (Array.isArray(list) ? list : []).forEach(item => {
            if (!item || typeof item !== 'object') { skipped++; return; }
            // V4.34: se escribe con la clave física serverId::id; el mapa se
            // indexa por esa misma clave para saber qué filas sobran.
            const row = this._persistRow(item, item.serverUrl);
            if (!row) { skipped++; return; }
            byId.set(row.id, row);
        });
        const result = await new Promise((resolve, reject) => {
            let tx;
            try {
                tx = this.db.transaction(['channels'], 'readwrite');
            } catch (e) {
                reject(e);
                return;
            }
            const store = tx.objectStore('channels');
            byId.forEach(obj => store.put(obj));
            // Borrar lo que ya no está, dentro de la MISMA transacción.
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
                const cur = e.target.result;
                if (!cur) return;
                if (!byId.has(cur.primaryKey)) store.delete(cur.primaryKey);
                cur.continue();
            };
            tx.oncomplete = () => resolve(byId.size);
            tx.onerror = () => reject(tx.error || new Error('replaceChannels: transacción fallida'));
            tx.onabort = () => reject(tx.error || new Error('replaceChannels: transacción abortada'));
        });
        if (skipped > 0) console.warn(`⚠️ replaceChannels: ${skipped} canales sin clave descartados`);
        return result;
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
