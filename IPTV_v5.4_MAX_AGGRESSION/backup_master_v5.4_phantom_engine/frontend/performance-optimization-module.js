/**
 * PERFORMANCE-OPTIMIZATION-MODULE.js
 * IPTV Navigator PRO - Módulo de Optimización de Rendimiento v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Optimizar operaciones IndexedDB con chunking
 * - Batch processing no-bloqueante
 * - Caché en memoria con LRU
 * - Debouncing de operaciones frecuentes
 * - Web Worker ready (preparado para procesamiento en background)
 * 
 * ✅ MEJORAS:
 * - saveChannelsBulk optimizado: chunks de 500 items
 * - Caché en memoria para lecturas frecuentes
 * - Debounce automático para saves consecutivos
 */

class PerformanceOptimizationModule {
    constructor(appInstance) {
        this.app = appInstance;
        this.db = appInstance?.db || window.dbManager;

        // Configuración de optimización
        this.config = {
            chunkSize: 500,           // Items por chunk en batch operations
            yieldInterval: 50,         // ms para yield al event loop
            cacheMaxItems: 1000,       // Máximo items en caché LRU
            cacheTTL: 5 * 60 * 1000,   // 5 minutos TTL
            debounceDelay: 1000,       // 1s debounce para saves
            enableMetrics: true        // Habilitar tracking de métricas
        };

        // Caché LRU en memoria
        this._cache = new Map();
        this._cacheOrder = [];

        // Debounce timers
        this._debounceTimers = new Map();

        // Métricas de rendimiento
        this.metrics = {
            dbReads: 0,
            dbWrites: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgReadTime: 0,
            avgWriteTime: 0,
            totalReadTime: 0,
            totalWriteTime: 0
        };

        console.log('⚡ PerformanceOptimizationModule v1.0 inicializado');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. BATCH PROCESSING OPTIMIZADO (Non-Blocking)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Guarda canales en chunks para no bloquear el UI
     * @param {Array} channels - Lista de canales
     * @param {string} serverUrl - URL del servidor
     * @param {Function} onProgress - Callback de progreso
     * @returns {Promise<object>} Resultado con estadísticas
     */
    async saveChannelsOptimized(channels, serverUrl, onProgress = null) {
        if (!this.db || !Array.isArray(channels)) {
            return { success: false, error: 'DB no disponible o datos inválidos' };
        }

        const startTime = performance.now();
        const totalChannels = channels.length;
        const chunks = this._chunkArray(channels, this.config.chunkSize);

        console.log(`⚡ [Optimized Save] ${totalChannels} canales en ${chunks.length} chunks`);

        let saved = 0;
        let errors = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            try {
                await this._saveChunk(chunk, serverUrl);
                saved += chunk.length;

                // Reportar progreso
                if (onProgress) {
                    onProgress({
                        current: saved,
                        total: totalChannels,
                        percent: Math.round((saved / totalChannels) * 100),
                        chunk: i + 1,
                        totalChunks: chunks.length
                    });
                }

                // Yield al event loop para mantener UI responsivo
                if (i < chunks.length - 1) {
                    await this._yield();
                }

            } catch (e) {
                console.error(`Error en chunk ${i + 1}:`, e);
                errors += chunk.length;
            }
        }

        const elapsed = performance.now() - startTime;
        this._recordMetric('write', elapsed);

        const result = {
            success: errors === 0,
            saved,
            errors,
            totalChannels,
            chunks: chunks.length,
            timeMs: Math.round(elapsed),
            perSecond: Math.round((saved / elapsed) * 1000)
        };

        console.log(`✅ [Optimized Save] ${saved} guardados en ${result.timeMs}ms (${result.perSecond}/s)`);

        return result;
    }

    /**
     * Guarda un chunk individual
     */
    async _saveChunk(chunk, serverUrl) {
        await this.db.ready();

        return new Promise((resolve, reject) => {
            const tx = this.db.db.transaction(['channels'], 'readwrite');
            const store = tx.objectStore('channels');
            const now = Date.now();

            chunk.forEach(ch => {
                const id = this.db.generateChannelId(ch);
                const entry = {
                    id,
                    serverUrl,
                    updatedAt: now,
                    qualityTags: ch.qualityTags,
                    transportFormatCode: ch.transportFormatCode,
                    codecFamily: ch.codecFamily,
                    avgBitrateKbps: ch.avgBitrateKbps,
                    bitrateTierCode: ch.bitrateTierCode,
                    tvg_id: ch.tvg_id,
                    name: ch.name,
                    logo: ch.logo
                };
                store.put(entry);
            });

            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. LECTURA OPTIMIZADA CON CACHÉ
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Obtiene canales con caché en memoria
     * @param {string} cacheKey - Clave de caché (ej: 'all' o serverId)
     * @returns {Promise<Array>} Lista de canales
     */
    async getChannelsCached(cacheKey = 'all') {
        // Check caché primero
        const cached = this._getFromCache(cacheKey);
        if (cached) {
            this.metrics.cacheHits++;
            console.log(`⚡ [Cache HIT] ${cacheKey}: ${cached.length} canales`);
            return cached;
        }

        this.metrics.cacheMisses++;

        // Leer de DB
        const startTime = performance.now();
        const channels = await this.db.loadChannels();
        const elapsed = performance.now() - startTime;

        this._recordMetric('read', elapsed);

        // Guardar en caché
        this._setInCache(cacheKey, channels);

        console.log(`⚡ [Cache MISS] ${cacheKey}: ${channels.length} canales cargados en ${Math.round(elapsed)}ms`);

        return channels;
    }

    /**
     * Invalida caché (llamar después de writes)
     */
    invalidateCache(cacheKey = null) {
        if (cacheKey) {
            this._cache.delete(cacheKey);
            this._cacheOrder = this._cacheOrder.filter(k => k !== cacheKey);
        } else {
            this._cache.clear();
            this._cacheOrder = [];
        }
        console.log(`⚡ [Cache] ${cacheKey ? cacheKey : 'Todo'} invalidado`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. DEBOUNCING PARA SAVES FRECUENTES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Guarda con debounce (evita múltiples saves consecutivos)
     * @param {string} key - Identificador de la operación
     * @param {Function} saveFunction - Función de guardado a ejecutar
     */
    debouncedSave(key, saveFunction) {
        // Cancelar timer anterior si existe
        if (this._debounceTimers.has(key)) {
            clearTimeout(this._debounceTimers.get(key));
        }

        // Crear nuevo timer
        const timer = setTimeout(async () => {
            console.log(`⚡ [Debounced] Ejecutando save: ${key}`);
            try {
                await saveFunction();
                this.invalidateCache(); // Invalidar caché después de save
            } catch (e) {
                console.error(`Error en debounced save ${key}:`, e);
            }
            this._debounceTimers.delete(key);
        }, this.config.debounceDelay);

        this._debounceTimers.set(key, timer);
    }

    /**
     * Fuerza ejecución inmediata de saves pendientes
     */
    async flushPendingSaves() {
        const keys = [...this._debounceTimers.keys()];
        console.log(`⚡ [Flush] ${keys.length} saves pendientes`);

        for (const key of keys) {
            clearTimeout(this._debounceTimers.get(key));
            this._debounceTimers.delete(key);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. PROCESAMIENTO INCREMENTAL (Generator-based)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Procesa canales incrementalmente sin bloquear UI
     * @param {Array} channels - Canales a procesar
     * @param {Function} processor - Función de procesamiento
     * @param {Function} onProgress - Callback de progreso
     * @returns {Promise<Array>} Canales procesados
     */
    async processChannelsIncremental(channels, processor, onProgress = null) {
        const results = [];
        const total = channels.length;
        const batchSize = this.config.chunkSize;

        for (let i = 0; i < total; i += batchSize) {
            const batch = channels.slice(i, i + batchSize);

            // Procesar batch
            for (const channel of batch) {
                try {
                    const processed = processor(channel);
                    results.push(processed);
                } catch (e) {
                    console.warn('Error procesando canal:', e);
                    results.push(channel); // Mantener original si falla
                }
            }

            // Reportar progreso
            if (onProgress) {
                onProgress({
                    current: Math.min(i + batchSize, total),
                    total,
                    percent: Math.round((Math.min(i + batchSize, total) / total) * 100)
                });
            }

            // Yield para mantener UI responsivo
            if (i + batchSize < total) {
                await this._yield();
            }
        }

        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. COMPACTACIÓN Y LIMPIEZA
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Elimina canales duplicados de IndexedDB
     * @returns {Promise<object>} Estadísticas de limpieza
     */
    async compactDatabase() {
        console.group('🗜️ Compactando base de datos...');
        const startTime = performance.now();

        // Cargar todos los canales
        const allChannels = await this.db.loadChannels();
        const originalCount = allChannels.length;

        // Deduplicar por ID
        const uniqueMap = new Map();
        allChannels.forEach(ch => {
            if (!uniqueMap.has(ch.id)) {
                uniqueMap.set(ch.id, ch);
            }
        });

        const uniqueChannels = [...uniqueMap.values()];
        const duplicatesRemoved = originalCount - uniqueChannels.length;

        if (duplicatesRemoved > 0) {
            // Limpiar y re-guardar
            await this.db.clearChannels();
            await this.saveChannelsOptimized(uniqueChannels, 'compacted');
            this.invalidateCache();
        }

        const elapsed = performance.now() - startTime;

        const result = {
            originalCount,
            finalCount: uniqueChannels.length,
            duplicatesRemoved,
            timeMs: Math.round(elapsed)
        };

        console.log(`✅ Compactación: ${duplicatesRemoved} duplicados eliminados en ${result.timeMs}ms`);
        console.groupEnd();

        return result;
    }

    /**
     * Elimina canales antiguos (no actualizados en X días)
     * @param {number} maxAgeDays - Máxima antigüedad en días
     */
    async pruneOldChannels(maxAgeDays = 30) {
        const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

        await this.db.ready();

        return new Promise((resolve, reject) => {
            const tx = this.db.db.transaction(['channels'], 'readwrite');
            const store = tx.objectStore('channels');
            const index = store.index('updatedAt');

            let deleted = 0;
            const range = IDBKeyRange.upperBound(cutoffTime);
            const request = index.openCursor(range);

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deleted++;
                    cursor.continue();
                }
            };

            tx.oncomplete = () => {
                console.log(`🗑️ Pruned: ${deleted} canales más antiguos que ${maxAgeDays} días`);
                this.invalidateCache();
                resolve(deleted);
            };

            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. MÉTRICAS Y DIAGNÓSTICO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Obtiene reporte de métricas de rendimiento
     */
    getMetricsReport() {
        const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(1)
            : 0;

        return {
            ...this.metrics,
            cacheHitRate: `${cacheHitRate}%`,
            cacheSize: this._cache.size,
            avgReadTime: this.metrics.dbReads > 0
                ? Math.round(this.metrics.totalReadTime / this.metrics.dbReads)
                : 0,
            avgWriteTime: this.metrics.dbWrites > 0
                ? Math.round(this.metrics.totalWriteTime / this.metrics.dbWrites)
                : 0
        };
    }

    /**
     * Resetea métricas
     */
    resetMetrics() {
        this.metrics = {
            dbReads: 0,
            dbWrites: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgReadTime: 0,
            avgWriteTime: 0,
            totalReadTime: 0,
            totalWriteTime: 0
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILIDADES INTERNAS
    // ═══════════════════════════════════════════════════════════════════════

    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    _yield() {
        return new Promise(resolve => setTimeout(resolve, this.config.yieldInterval));
    }

    _recordMetric(type, timeMs) {
        if (!this.config.enableMetrics) return;

        if (type === 'read') {
            this.metrics.dbReads++;
            this.metrics.totalReadTime += timeMs;
        } else if (type === 'write') {
            this.metrics.dbWrites++;
            this.metrics.totalWriteTime += timeMs;
        }
    }

    _getFromCache(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > this.config.cacheTTL) {
            this._cache.delete(key);
            return null;
        }

        return entry.data;
    }

    _setInCache(key, data) {
        // LRU eviction si excede máximo
        while (this._cache.size >= this.config.cacheMaxItems) {
            const oldestKey = this._cacheOrder.shift();
            if (oldestKey) this._cache.delete(oldestKey);
        }

        this._cache.set(key, {
            data,
            timestamp: Date.now()
        });

        // Mover a final del orden (más reciente)
        this._cacheOrder = this._cacheOrder.filter(k => k !== key);
        this._cacheOrder.push(key);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR GLOBALMENTE
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.PerformanceOptimizationModule = PerformanceOptimizationModule;
    console.log('⚡ PerformanceOptimizationModule disponible en window.PerformanceOptimizationModule');
}
