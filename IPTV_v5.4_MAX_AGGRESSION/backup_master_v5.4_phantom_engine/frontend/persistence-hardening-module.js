/**
 * PERSISTENCE-HARDENING-MODULE.js
 * IPTV Navigator PRO - Módulo de Hardening de Persistencia v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Reforzar el sistema de commitStateChange() existente
 * - Prevenir escrituras parciales y estados inconsistentes
 * - Detectar y recuperar de corrupción de datos
 * - Implementar transacciones atómicas en IndexedDB
 * 
 * ✅ COMPLIANCE:
 * - Política de persistencia: IndexedDB = ÚNICA fuente de verdad
 * - Principio: Si no pasa por commitStateChange, no existe
 * - Tests automáticos de integridad
 */

class PersistenceHardeningModule {
    constructor(appInstance) {
        this.app = appInstance;
        this.db = appInstance?.db || null;
        this.checksumEnabled = true;
        this.autoRecoveryEnabled = true;
        this.integrityCheckInterval = 60000; // 1 minuto
        this._intervalId = null;

        // Estado de verificación
        this._lastIntegrityCheck = null;
        this._integrityStatus = 'UNKNOWN';

        console.log('🛡️ PersistenceHardeningModule v1.0 inicializado');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. VERIFICACIÓN DE INTEGRIDAD
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula checksum simple de un array de canales
     * @param {array} channels - Array de canales
     * @returns {string} Checksum hexadecimal
     */
    calculateChannelsChecksum(channels) {
        if (!Array.isArray(channels)) return '0';

        // Checksum basado en: cantidad + suma de stream_ids + cantidad de servidores únicos
        let hash = channels.length;
        const serverIds = new Set();

        channels.forEach(ch => {
            hash += (ch.stream_id || 0);
            hash += (ch.id || 0);
            if (ch.serverId) serverIds.add(ch.serverId);
        });

        hash += serverIds.size * 1000000;

        return hash.toString(16).toUpperCase();
    }

    /**
     * Verifica integridad entre RAM e IndexedDB
     * @returns {Promise<object>} Resultado de verificación
     */
    async verifyIntegrity() {
        const result = {
            timestamp: new Date().toISOString(),
            ramChannels: 0,
            dbChannels: 0,
            ramServers: 0,
            dbServers: 0,
            ramChecksum: '',
            dbChecksum: '',
            consistent: false,
            issues: []
        };

        try {
            // RAM state
            result.ramChannels = this.app?.state?.channelsMaster?.length || 0;
            result.ramServers = this.app?.state?.activeServers?.length || 0;
            result.ramChecksum = this.calculateChannelsChecksum(this.app?.state?.channelsMaster);

            // DB state
            if (this.db) {
                const dbChannels = await this.db.loadChannels();
                const dbServersData = await this.db.getAppState('activeServers');

                result.dbChannels = dbChannels?.length || 0;
                result.dbServers = dbServersData?.activeServers?.length || 0;
                result.dbChecksum = this.calculateChannelsChecksum(dbChannels);
            }

            // Comparar
            if (result.ramChannels !== result.dbChannels) {
                result.issues.push({
                    type: 'CHANNEL_COUNT_MISMATCH',
                    message: `RAM=${result.ramChannels} vs DB=${result.dbChannels}`,
                    severity: 'HIGH'
                });
            }

            if (result.ramServers !== result.dbServers) {
                result.issues.push({
                    type: 'SERVER_COUNT_MISMATCH',
                    message: `RAM=${result.ramServers} vs DB=${result.dbServers}`,
                    severity: 'MEDIUM'
                });
            }

            if (result.ramChecksum !== result.dbChecksum) {
                result.issues.push({
                    type: 'CHECKSUM_MISMATCH',
                    message: `RAM=${result.ramChecksum} vs DB=${result.dbChecksum}`,
                    severity: 'HIGH'
                });
            }

            result.consistent = result.issues.length === 0;

            // Log resultado
            if (result.consistent) {
                console.log('✅ Integridad OK:', result.ramChannels, 'canales,', result.ramServers, 'servidores');
            } else {
                console.warn('⚠️ Problemas de integridad detectados:', result.issues);
            }

            this._lastIntegrityCheck = result;
            this._integrityStatus = result.consistent ? 'OK' : 'ISSUES_DETECTED';

        } catch (e) {
            result.issues.push({
                type: 'VERIFICATION_ERROR',
                message: e.message,
                severity: 'CRITICAL'
            });
            console.error('❌ Error en verificación de integridad:', e);
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. DETECCIÓN DE SERVIDORES FANTASMA
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Detecta servidores en activeServers que no tienen canales asociados
     * @returns {array} Lista de servidores fantasma
     */
    detectPhantomServers() {
        const phantoms = [];
        const servers = this.app?.state?.activeServers || [];
        const channels = this.app?.state?.channelsMaster || [];

        // Crear set de serverIds con canales
        const serverIdsWithChannels = new Set();
        channels.forEach(ch => {
            if (ch.serverId || ch._serverId) {
                serverIdsWithChannels.add(ch.serverId || ch._serverId);
            }
        });

        // Detectar servidores sin canales
        servers.forEach(server => {
            if (!serverIdsWithChannels.has(server.id)) {
                phantoms.push({
                    id: server.id,
                    name: server.name,
                    baseUrl: server.baseUrl,
                    channelCount: 0
                });
            }
        });

        if (phantoms.length > 0) {
            console.warn('👻 Servidores fantasma detectados:', phantoms.length);
        }

        return phantoms;
    }

    /**
     * Detecta canales huérfanos (sin servidor asociado en activeServers)
     * @returns {array} Lista de canales huérfanos
     */
    detectOrphanChannels() {
        const orphans = [];
        const servers = this.app?.state?.activeServers || [];
        const channels = this.app?.state?.channelsMaster || [];

        // Crear set de serverIds activos
        const activeServerIds = new Set(servers.map(s => s.id));

        // Detectar canales sin servidor
        channels.forEach((ch, idx) => {
            const serverId = ch.serverId || ch._serverId;
            if (serverId && !activeServerIds.has(serverId)) {
                orphans.push({
                    index: idx,
                    name: ch.name?.substring(0, 50),
                    serverId,
                    stream_id: ch.stream_id
                });
            }
        });

        if (orphans.length > 0) {
            console.warn('🔗 Canales huérfanos detectados:', orphans.length);
        }

        return orphans;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. REPARACIÓN AUTOMÁTICA
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Repara inconsistencias detectadas
     * @param {object} options - Opciones de reparación
     * @returns {Promise<object>} Resultado de reparación
     */
    async repairInconsistencies(options = {}) {
        const {
            removePhantoms = true,
            removeOrphans = true,
            syncFromDb = false // Si true, DB gana sobre RAM
        } = options;

        const result = {
            timestamp: new Date().toISOString(),
            phantomsRemoved: 0,
            orphansRemoved: 0,
            syncedFromDb: false,
            success: false
        };

        console.group('🔧 REPARACIÓN DE INCONSISTENCIAS');

        try {
            // 1. Remover servidores fantasma
            if (removePhantoms) {
                const phantoms = this.detectPhantomServers();
                if (phantoms.length > 0 && this.app?.state?.activeServers) {
                    const phantomIds = new Set(phantoms.map(p => p.id));
                    this.app.state.activeServers = this.app.state.activeServers.filter(
                        s => !phantomIds.has(s.id)
                    );
                    result.phantomsRemoved = phantoms.length;
                    console.log(`✅ ${phantoms.length} servidores fantasma eliminados`);
                }
            }

            // 2. Remover canales huérfanos
            if (removeOrphans) {
                const orphans = this.detectOrphanChannels();
                if (orphans.length > 0 && this.app?.state?.channelsMaster) {
                    const activeServerIds = new Set(
                        (this.app.state.activeServers || []).map(s => s.id)
                    );

                    this.app.state.channelsMaster = this.app.state.channelsMaster.filter(ch => {
                        const serverId = ch.serverId || ch._serverId;
                        return !serverId || activeServerIds.has(serverId);
                    });

                    // Actualizar channels también
                    this.app.state.channels = [...this.app.state.channelsMaster];

                    result.orphansRemoved = orphans.length;
                    console.log(`✅ ${orphans.length} canales huérfanos eliminados`);
                }
            }

            // 3. Sincronizar desde DB si se requiere
            if (syncFromDb && this.db) {
                console.log('📥 Sincronizando desde IndexedDB...');

                const dbChannels = await this.db.loadChannels();
                const dbServersData = await this.db.getAppState('activeServers');

                if (dbChannels) {
                    this.app.state.channelsMaster = dbChannels;
                    this.app.state.channels = [...dbChannels];
                }

                if (dbServersData?.activeServers) {
                    this.app.state.activeServers = dbServersData.activeServers;
                    this.app.state.currentServer = dbServersData.currentServer || {};
                }

                result.syncedFromDb = true;
                console.log(`✅ Sincronizado: ${dbChannels?.length} canales, ${dbServersData?.activeServers?.length} servidores`);
            }

            // 4. Persistir cambios
            if (result.phantomsRemoved > 0 || result.orphansRemoved > 0) {
                await this.app.commitStateChange({
                    servers: true,
                    channels: true,
                    reason: `Auto-reparación: ${result.phantomsRemoved} fantasmas, ${result.orphansRemoved} huérfanos eliminados`
                });
            }

            result.success = true;

        } catch (e) {
            console.error('❌ Error en reparación:', e);
            result.error = e.message;
        }

        console.groupEnd();
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. MONITOREO CONTINUO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Inicia verificación periódica de integridad
     */
    startIntegrityMonitor() {
        if (this._intervalId) {
            console.warn('⚠️ Monitor ya está activo');
            return;
        }

        this._intervalId = setInterval(async () => {
            const result = await this.verifyIntegrity();

            // Auto-reparar si hay problemas y está habilitado
            if (!result.consistent && this.autoRecoveryEnabled) {
                console.warn('🔧 Auto-reparación iniciada...');
                await this.repairInconsistencies({
                    removePhantoms: true,
                    removeOrphans: true,
                    syncFromDb: false
                });
            }
        }, this.integrityCheckInterval);

        console.log('👁️ Monitor de integridad iniciado (intervalo:', this.integrityCheckInterval, 'ms)');
    }

    /**
     * Detiene monitoreo
     */
    stopIntegrityMonitor() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            console.log('👁️ Monitor de integridad detenido');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. TRANSACCIONES ATÓMICAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Ejecuta una operación con rollback en caso de error
     * @param {function} operation - Función async que modifica estado
     * @param {string} reason - Razón de la operación
     * @returns {Promise<object>} Resultado de la operación
     */
    async executeWithRollback(operation, reason = 'Operación atómica') {
        // Crear snapshot del estado actual
        const snapshot = {
            channelsMaster: JSON.stringify(this.app?.state?.channelsMaster || []),
            activeServers: JSON.stringify(this.app?.state?.activeServers || []),
            currentServer: JSON.stringify(this.app?.state?.currentServer || {})
        };

        console.group(`🔐 TRANSACCIÓN: ${reason}`);

        try {
            // Ejecutar operación
            const result = await operation();

            // Commit si éxito
            await this.app.commitStateChange({
                servers: true,
                channels: true,
                reason: reason
            });

            console.log('✅ Transacción completada exitosamente');
            console.groupEnd();

            return { success: true, result };

        } catch (e) {
            console.error('❌ Error en transacción, ejecutando rollback...', e);

            // Rollback
            try {
                this.app.state.channelsMaster = JSON.parse(snapshot.channelsMaster);
                this.app.state.channels = [...this.app.state.channelsMaster];
                this.app.state.activeServers = JSON.parse(snapshot.activeServers);
                this.app.state.currentServer = JSON.parse(snapshot.currentServer);

                console.log('✅ Rollback completado');
            } catch (rollbackError) {
                console.error('❌ Error en rollback:', rollbackError);
            }

            console.groupEnd();
            return { success: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. API DE DIAGNÓSTICO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Genera reporte completo de salud del sistema de persistencia
     * @returns {Promise<object>} Reporte de salud
     */
    async generateHealthReport() {
        console.group('📊 REPORTE DE SALUD DE PERSISTENCIA');

        const report = {
            timestamp: new Date().toISOString(),
            version: '1.0',
            integrity: await this.verifyIntegrity(),
            phantomServers: this.detectPhantomServers(),
            orphanChannels: this.detectOrphanChannels().slice(0, 10), // Limitar para no saturar
            orphanChannelsTotal: this.detectOrphanChannels().length,
            lastIntegrityCheck: this._lastIntegrityCheck,
            integrityStatus: this._integrityStatus,
            monitorActive: this._intervalId !== null,
            autoRecoveryEnabled: this.autoRecoveryEnabled
        };

        // Calcular score de salud (0-100)
        let healthScore = 100;

        if (!report.integrity.consistent) healthScore -= 30;
        if (report.phantomServers.length > 0) healthScore -= report.phantomServers.length * 5;
        if (report.orphanChannelsTotal > 0) healthScore -= Math.min(20, report.orphanChannelsTotal);

        report.healthScore = Math.max(0, healthScore);
        report.healthStatus = healthScore >= 80 ? 'HEALTHY' :
            healthScore >= 50 ? 'DEGRADED' : 'CRITICAL';

        console.log(`📊 Salud del sistema: ${report.healthScore}/100 (${report.healthStatus})`);
        console.groupEnd();

        return report;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR GLOBALMENTE
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.PersistenceHardeningModule = PersistenceHardeningModule;
    console.log('🛡️ PersistenceHardeningModule disponible en window.PersistenceHardeningModule');
}
