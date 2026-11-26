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
            // Copia, no mutación: devolver el MISMO objeto que guardó el store
            // reescribía `id` en el original y la siguiente lectura por esa
            // clave ya no lo encontraba (medido en catalog-persistence).
            const out = Object.assign({}, row);
            out.id = row._channelId;
            delete out._channelId;
            return out;
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
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                this._opening = null;
                console.error('DatabaseManager: Error al abrir BD', error);
                reject(error);
            };

            request.onerror = (event) => fail(event.target.error);

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
            try {
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
            } catch (error) {
                // Un put que lanza (DataCloneError) no puede dejar la transacción
                // abierta ni confirmar las filas anteriores como guardado parcial.
                try { tx.abort(); } catch (_) { /* Puede haberse abortado ya. */ }
                throw error;
            }
            if (skipped > 0) console.warn(`⚠️ saveChannels: ${skipped} canales sin clave descartados`);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = (event) => {
                    const error = tx.error || (event && event.target && event.target.error);
                    reject(error || new DOMException('saveChannels: transacción fallida', 'AbortError'));
                };
                tx.onabort = () => reject(new DOMException('saveChannels: transacción abortada', 'AbortError'));
            });
        } catch (e) {
            console.error("saveChannels error", e);
            throw e;
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
            transaction.onerror = (event) => {
                const error = transaction.error || (event && event.target && event.target.error);
                reject(error || new DOMException('Guardado de metadatos abortado', 'AbortError'));
            };
            transaction.onabort = () => reject(new DOMException('Guardado de metadatos abortado', 'AbortError'));

            const now = Date.now();

            // V4.33: UNA ficha por canal y COMPLETA.
            // Antes se guardaba un resumen (sin `url` ni `serverId`) con la clave
            // `tvg:...`/`hash:...`, distinta de la clave que usa saveChannels() (el
            // `id` del canal). Resultado medido en el log de la app: el mismo canal
            // quedaba DOS veces (57.310 filas para 28.655 canales) y la copia
            // resumida aparecia al recargar como "28.640 canales sin serverId
            // (0 inferidos)": sin `url` no hay forma de atribuirla a un servidor.
            try {
                (Array.isArray(channels) ? channels : []).forEach(ch => {
                    if (!ch || typeof ch !== 'object') return;
                    // V4.34: clave compuesta serverId::id. El canal se guarda entero
                    // (url, serverId, group...) y sólo se fuerzan la clave, el origen
                    // y la marca de tiempo. El id original vive en `_channelId`.
                    const row = this._persistRow(ch, serverUrl, now);
                    if (!row) return;
                    store.put(row);
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
                const set = new Map();
                for (let i = 0; i < _want.length; i++) {
                    const ch = _want[i];
                    if (!ch) continue;
                    const id = (ch.id !== undefined && ch.id !== null && ch.id !== '')
                        ? String(ch.id)
                        : this.generateChannelId(ch);
                    if (!id) continue;
                    const sId = (ch.serverId && String(ch.serverId))
                        || (serverId && String(serverId)) || '';
                    set.set(sId ? `${sId}::${id}` : id, id);
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
                    transaction.onerror = (event) => reject(transaction.error || event.target.error);
                    transaction.onabort = () => reject(transaction.error || new DOMException('Lectura de metadatos abortada', 'AbortError'));
                    _ids.forEach((plainId, key) => {
                        const req = store.get(key);
                        req.onsuccess = () => {
                            if (!req.result) return this._legacyLookup(store, resultMap, plainId, key);
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
            transaction.oncomplete = () => resolve(resultMap);
            transaction.onerror = (event) => reject(transaction.error || event.target.error);
            transaction.onabort = () => reject(transaction.error || new DOMException('Lectura de metadatos abortada', 'AbortError'));

            // Estrategia de respaldo: cursor completo sobre el store.
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const row = this._restoreRow(cursor.value);
                    resultMap.set(String(row.id), row);
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
            try {
                tx.objectStore('app_state').put({ key, value });
            } catch (error) {
                try { tx.abort(); } catch (_) { /* Puede haberse abortado ya. */ }
                reject(error);
            }
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
            const tx = this.db.transaction(['channels'], 'readwrite');
            tx.objectStore('channels').clear();
            tx.oncomplete = () => {
                console.log('🗑️ IndexedDB: Canales limpiados');
                resolve();
            };
            tx.onerror = (e) => reject(tx.error || e.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Limpieza de canales abortada', 'AbortError'));
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
     * V4.34F: reemplaza el catálogo de UN servidor en una sola transacción.
     *
     * Medido 2026-11-24: al reconectar, `mergeServerChannels()` retiraba de
     * memoria el canal retirado pero su fila seguía en IndexedDB; en la recarga
     * reaparecía (canal 001 del fixture A). Limpiar y guardar en dos llamadas
     * deja una ventana en la que la base puede quedar a medias; aquí las filas
     * nuevas y el borrado de las retiradas comparten transacción.
     */
    async replaceChannelsForServer(serverUrl, list) {
        await this.ready();
        const normalizeServer = value => typeof value === 'string'
            ? value.replace(/\/+$/, '').replace(/\/player_api\.php$/i, '').replace(/\/+$/, '')
            : '';
        const target = normalizeServer(serverUrl);
        if (!target) throw new DOMException('Se requiere la URL del servidor', 'DataError');

        const byId = new Map();
        let skipped = 0;
        (Array.isArray(list) ? list : []).forEach(item => {
            if (!item || typeof item !== 'object') { skipped++; return; }
            const row = this._persistRow(item, serverUrl);
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
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
                const cur = e.target.result;
                if (!cur) return;
                if (!byId.has(cur.primaryKey) && normalizeServer(cur.value.serverUrl) === target) {
                    store.delete(cur.primaryKey);
                }
                cur.continue();
            };
            tx.oncomplete = () => resolve(byId.size);
            tx.onerror = () => {
                const error = tx.error || new Error('replaceChannelsForServer: transacción fallida');
                reject(error);
            };
            tx.onabort = () => reject(tx.error || new DOMException('replaceChannelsForServer: transacción abortada', 'AbortError'));
        });
        if (skipped > 0) console.warn(`⚠️ replaceChannelsForServer: ${skipped} canales sin clave descartados`);
        return result;
    }

    /**
     * V4.8.3: Limpia canales de un servidor específico.
     *
     * V4.34F (medido 2026-11-24): la URL se compara NORMALIZADA. Había filas
     * guardadas con `http://host/player_api.php` (o con barra final) y la app
     * limpiaba con `http://host`; el índice `serverUrl` no las encontraba, la
     * fila retirada sobrevivía y reaparecía al recargar (canal 001 del fixture
     * A tras reconectar). Se recorre el store y se normaliza cada fila con la
     * misma regla que usa la app; los paths distintos del mismo host siguen
     * siendo servidores distintos.
     */
    async clearChannelsByServer(serverUrl) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['channels'], 'readwrite');
            const store = tx.objectStore('channels');
            const normalizeServer = value => typeof value === 'string'
                ? value.replace(/\/+$/, '').replace(/\/player_api\.php$/i, '').replace(/\/+$/, '')
                : '';
            const target = normalizeServer(serverUrl);
            if (!target) {
                try { tx.abort(); } catch (_) { /* Puede haberse abortado ya. */ }
                reject(new DOMException('Se requiere la URL del servidor', 'DataError'));
                return;
            }

            let deleted = 0;
            tx.oncomplete = () => {
                console.log(`🗑️ IndexedDB: ${deleted} canales del servidor eliminados`);
                resolve(deleted);
            };
            tx.onerror = (e) => reject(tx.error || e.target.error);
            tx.onabort = () => reject(tx.error || new DOMException('Limpieza del servidor abortada', 'AbortError'));

            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) return;
                if (normalizeServer(cursor.value.serverUrl) === target) {
                    cursor.delete();
                    deleted++;
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Exportar
if (typeof window !== 'undefined') {
    window.dbManager = new DatabaseManager();
}
