/**
 * ═══════════════════════════════════════════════════════════════════════
 * 📦 SERVER LIBRARY MULTI-SAVE FIX v1.0
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * SOLUCIÓN PARA: Guardado incremental de múltiples servidores con clasificación por calidad
 * 
 * PROBLEMA RESUELTO:
 * - Solo se guardaba el último servidor en la biblioteca
 * - No se clasificaban canales por calidad al guardar
 * - IDs se perdían al reconectar desde biblioteca
 * - Conflicto entre append=true y append=false en processChannels
 * 
 * FUNCIONES INCLUIDAS:
 * 1. saveAllActiveServersToLibrary() - Guarda TODOS los servidores activos
 * 2. connectFromLibraryFixed() - Reconecta preservando ID original
 * 3. addServerToConnectionsFixed() - Agrega sin borrar existentes
 * 4. verifyServerLibraryState() - Comando de diagnóstico
 * 
 * 🚀 OPTIMIZADO PARA 300K+ CANALES
 * ═══════════════════════════════════════════════════════════════════════
 */

class ServerLibraryMultiSave {
    constructor() {
        this.debugMode = true;
        console.log('📦 ServerLibraryMultiSave v1.0 inicializado');
    }

    /**
     * Instalar todas las funciones en la app
     */
    install(appInstance) {
        if (!appInstance) {
            console.error('❌ appInstance es null');
            return false;
        }

        console.group('📦 Instalando Server Library Multi-Save');

        // Bind functions to app instance
        appInstance.saveAllActiveServersToLibrary = this.saveAllActiveServersToLibrary.bind(appInstance);
        appInstance.connectFromLibraryFixed = this.connectFromLibraryFixed.bind(appInstance);
        appInstance.addServerToConnectionsFixed = this.addServerToConnectionsFixed.bind(appInstance);
        appInstance.verifyServerLibraryState = this.verifyServerLibraryState.bind(appInstance);

        console.log('✅ saveAllActiveServersToLibrary instalado');
        console.log('✅ connectFromLibraryFixed instalado');
        console.log('✅ addServerToConnectionsFixed instalado');
        console.log('✅ verifyServerLibraryState instalado');
        console.groupEnd();

        return true;
    }

    /**
     * Guarda TODOS los servidores activos a la biblioteca con clasificación por calidad
     */
    async saveAllActiveServersToLibrary() {
        if (!this.state.activeServers || this.state.activeServers.length === 0) {
            alert('⚠️ No hay servidores activos para guardar');
            return;
        }

        console.log('💾 === INICIANDO GUARDADO MASIVO DE SERVIDORES ===');
        console.log(`📊 Servidores activos a procesar: ${this.state.activeServers.length}`);

        // Cargar biblioteca existente
        let library = [];
        try {
            const stored = localStorage.getItem('iptv_server_library');
            library = stored ? JSON.parse(stored) : [];
            console.log(`📚 Biblioteca actual: ${library.length} servidores`);
        } catch (e) {
            library = [];
            console.warn('⚠️ Error leyendo biblioteca, se creará nueva:', e);
        }

        let savedCount = 0;
        let updatedCount = 0;
        const errors = [];

        for (const srv of this.state.activeServers) {
            try {
                console.log(`\n🔄 Procesando: ${srv.name || srv.id}`);

                // Calcular snapshot con clasificación por calidad
                const snap = this.computeServerSnapshot ?
                    this.computeServerSnapshot(srv.id) :
                    this._computeBasicSnapshot(srv.id);

                if (!snap || snap.channelsCount === 0) {
                    console.warn(`⚠️ Servidor ${srv.name} no tiene canales, se omite`);
                    continue;
                }

                srv.snapshot = snap;

                let expDate = 'N/A';
                // ✅ V4.28.2: Usar _expDate por servidor (guardado desde user_info.exp_date)
                if (srv._expDate) {
                    const exp = new Date(srv._expDate * 1000);
                    expDate = exp.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                } else if (this.state.userInfo?.exp_date && this.state.currentServer?.id === srv.id) {
                    const exp = new Date(this.state.userInfo.exp_date * 1000);
                    expDate = exp.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                }

                const libraryEntry = {
                    id: srv.id,
                    name: srv.name || 'Servidor sin nombre',
                    baseUrl: srv.baseUrl?.replace('/player_api.php', '') || srv.url || '',
                    username: srv.username || '',
                    password: srv._lockedPassword || srv.password || '',
                    apiType: srv.apiType || 'auto',
                    totalChannels: snap.channelsCount,
                    totalGroups: snap.groupsCount || 0,
                    quality8K: snap.qualities?.['8k'] || 0,
                    quality4K: snap.qualities?.['4k'] || 0,
                    qualityFHD: snap.qualities?.['fhd'] || 0,
                    qualityHD: snap.qualities?.['hd'] || 0,
                    qualitySD: snap.qualities?.['sd'] || 0,
                    expDate: expDate,
                    savedAt: new Date().toISOString()
                };

                console.log(`📊 Calidad:`, {
                    '8K': libraryEntry.quality8K,
                    '4K': libraryEntry.quality4K,
                    'FHD': libraryEntry.qualityFHD,
                    'HD': libraryEntry.qualityHD,
                    'SD': libraryEntry.qualitySD
                });

                const existingIdx = library.findIndex(s =>
                    s.id === srv.id ||
                    (s.baseUrl && s.baseUrl === libraryEntry.baseUrl)
                );

                if (existingIdx >= 0) {
                    const oldEntry = library[existingIdx];
                    // ✅ V4.28.2: Si no tenemos _expDate, PRESERVAR la fecha existente de la biblioteca
                    if (libraryEntry.expDate === 'N/A' && oldEntry.expDate && oldEntry.expDate !== 'N/A') {
                        libraryEntry.expDate = oldEntry.expDate;
                    }
                    library[existingIdx] = libraryEntry;
                    updatedCount++;
                    console.log(`📝 Actualizado: ${libraryEntry.name} (${oldEntry.totalChannels} → ${libraryEntry.totalChannels})`);
                } else {
                    library.push(libraryEntry);
                    savedCount++;
                    console.log(`💾 Guardado nuevo: ${libraryEntry.name} (${libraryEntry.totalChannels} canales)`);
                }

            } catch (e) {
                console.error(`❌ Error procesando servidor ${srv.name}:`, e);
                errors.push(`${srv.name}: ${e.message}`);
            }
        }

        try {
            localStorage.setItem('iptv_server_library', JSON.stringify(library));
            console.log(`\n💾 Biblioteca guardada: ${library.length} servidores totales`);
        } catch (e) {
            console.error('❌ Error guardando biblioteca:', e);
            alert('❌ Error al guardar biblioteca en localStorage');
            return;
        }

        if (this.commitStateChange) {
            try {
                await this.commitStateChange({
                    servers: true,
                    reason: 'Guardado masivo de servidores a biblioteca'
                });
                console.log('✅ Servidores persistidos en IndexedDB');
            } catch (e) {
                console.warn('⚠️ Error persistiendo a IndexedDB:', e);
            }
        }

        if (this.renderSavedServersTable) {
            this.renderSavedServersTable();
            console.log('✅ Tabla de servidores actualizada');
        }

        const total = savedCount + updatedCount;
        let message = `✅ Guardado completo:\n\n` +
            `📊 Total procesado: ${total} servidores\n` +
            `➕ Nuevos: ${savedCount}\n` +
            `📝 Actualizados: ${updatedCount}\n\n` +
            `🗄️ Biblioteca total: ${library.length} servidores`;

        if (errors.length > 0) {
            message += `\n\n⚠️ Errores: ${errors.length}\n${errors.join('\n')}`;
        }

        alert(message);
        console.log(`\n✅ === GUARDADO COMPLETO ===`);
    }

    /**
     * Helper para calcular snapshot básico si computeServerSnapshot no existe
     */
    _computeBasicSnapshot(serverId) {
        const channels = this.state.channelsMaster?.filter(ch =>
            (ch.serverId || ch._serverId) === serverId
        ) || [];

        const qualities = { '8k': 0, '4k': 0, 'fhd': 0, 'hd': 0, 'sd': 0 };

        channels.forEach(ch => {
            const res = (ch.resolution || '').toString().toLowerCase();
            if (res.includes('8k') || res.includes('7680') || res.includes('4320')) {
                qualities['8k']++;
            } else if (res.includes('4k') || res.includes('2160') || res.includes('uhd')) {
                qualities['4k']++;
            } else if (res.includes('1080') || res.includes('fhd')) {
                qualities['fhd']++;
            } else if (res.includes('720') || res === 'hd') {
                qualities['hd']++;
            } else {
                qualities['sd']++;
            }
        });

        const groups = new Set(channels.map(ch => ch.group || ch.category_name || 'Sin grupo'));

        return {
            channelsCount: channels.length,
            groupsCount: groups.size,
            qualities
        };
    }

    /**
     * Conecta un servidor desde la biblioteca preservando su ID original
     * ✅ V4.27.4: Redirige a connectFromLibrary de app.js
     */
    async connectFromLibraryFixed(serverId) {
        try {
            console.log(`🔌 [MultiSave] Redirigiendo a connectFromLibrary: ${serverId}`);
            
            // ✅ V4.27.4: Simplemente llamar a la función principal de app.js
            if (typeof this.connectFromLibrary === 'function') {
                await this.connectFromLibrary(serverId);
            } else {
                console.error('❌ connectFromLibrary no disponible');
            }
        } catch (e) {
            console.error('Error al conectar desde biblioteca:', e);
            this._connectionInProgress = false; // ✅ Liberar flag en caso de error
        }
    }

    /**
     * Agrega un servidor de la biblioteca a los activos SIN borrar los existentes
     * ✅ V4.27.4: Redirige a addServerToConnections de app.js
     */
    async addServerToConnectionsFixed(serverId) {
        try {
            console.log(`➕ [MultiSave] Redirigiendo a addServerToConnections: ${serverId}`);
            
            // ✅ V4.27.4: Simplemente llamar a la función principal de app.js
            if (typeof this.addServerToConnections === 'function') {
                await this.addServerToConnections(serverId);
            } else {
                console.error('❌ addServerToConnections no disponible');
            }
        } catch (e) {
            console.error('Error agregando servidor:', e);
            this._connectionInProgress = false; // ✅ Liberar flag en caso de error
        }
    }

    /**
     * Verifica el estado actual de la biblioteca y servidores activos
     */
    verifyServerLibraryState() {
        console.log('\n🔍 === VERIFICACIÓN DE ESTADO ===\n');

        console.log('📍 SERVIDORES ACTIVOS (RAM):');
        if (this.state.activeServers && this.state.activeServers.length > 0) {
            console.table(this.state.activeServers.map(s => ({
                ID: s.id,
                Nombre: s.name,
                Canales: this.state.channelsMaster?.filter(ch =>
                    (ch.serverId || ch._serverId) === s.id
                ).length || 0,
                URL: s.baseUrl || s.url
            })));
        } else {
            console.log('   ❌ No hay servidores activos');
        }

        console.log('\n📚 BIBLIOTECA (localStorage):');
        try {
            const library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
            if (library.length > 0) {
                console.table(library.map(s => ({
                    ID: s.id,
                    Nombre: s.name,
                    Canales: s.totalChannels,
                    '8K': s.quality8K || 0,
                    '4K': s.quality4K || 0,
                    'FHD': s.qualityFHD || 0,
                    'HD': s.qualityHD || 0,
                    'SD': s.qualitySD || 0
                })));
            } else {
                console.log('   ❌ Biblioteca vacía');
            }
        } catch (e) {
            console.error('   ❌ Error leyendo biblioteca:', e);
        }

        console.log(`\n📊 CANALES TOTALES: ${this.state.channelsMaster?.length || 0}`);

        console.log('\n📈 CANALES POR SERVIDOR:');
        if (this.state.activeServers && this.state.activeServers.length > 0) {
            const breakdown = {};
            this.state.channelsMaster?.forEach(ch => {
                const sid = ch.serverId || ch._serverId || 'unknown';
                breakdown[sid] = (breakdown[sid] || 0) + 1;
            });
            console.table(breakdown);
        }

        console.log('\n✅ === FIN VERIFICACIÓN ===\n');
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.ServerLibraryMultiSave = ServerLibraryMultiSave;
    console.log('✅ ServerLibraryMultiSave disponible globalmente');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerLibraryMultiSave;
}
