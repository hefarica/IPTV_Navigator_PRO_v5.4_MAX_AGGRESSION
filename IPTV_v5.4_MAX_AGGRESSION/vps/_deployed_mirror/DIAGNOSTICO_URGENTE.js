/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 DIAGNÓSTICO URGENTE - CANALES NO CARGAN (0 CANALES)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEMA: Conexión exitosa pero 0 canales mostrados
 * 
 * POSIBLES CAUSAS:
 * 1. API retorna array vacío
 * 2. IndexedDB está vacío o corrupto
 * 3. channelsMaster no se sincroniza con channels
 * 4. Filtros demasiado restrictivos
 * 5. Servidores activos sin IDs válidos
 * 
 * USO: Ejecutar en consola (F12) después de conectar
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT 1: DIAGNÓSTICO COMPLETO DEL SISTEMA
// ═══════════════════════════════════════════════════════════════════════════════

async function diagnosticoCompleto() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║ 🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA                                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const diagnostico = {
        timestamp: new Date().toISOString(),
        problemas: [],
        recomendaciones: []
    };

    // ═══════════════════════════════════════════════════════════════════
    // FASE 1: VERIFICAR ESTADO DE RAM
    // ═══════════════════════════════════════════════════════════════════
    console.log('📋 FASE 1: Estado de RAM');
    console.log('─────────────────────────────────────────────────────────────────────');

    const ramState = {
        activeServers: app?.state?.activeServers?.length || 0,
        channelsMaster: app?.state?.channelsMaster?.length || 0,
        channels: app?.state?.channels?.length || 0,
        servers: app?.state?.servers?.length || 0
    };

    console.table(ramState);

    if (ramState.channelsMaster === 0) {
        diagnostico.problemas.push('❌ channelsMaster está VACÍO (0 canales en RAM)');
    }

    if (ramState.activeServers === 0) {
        diagnostico.problemas.push('❌ No hay servidores activos en RAM');
    }

    if (ramState.channelsMaster > 0 && ramState.channels === 0) {
        diagnostico.problemas.push('⚠️ channelsMaster tiene datos pero channels está vacío (problema de filtros)');
        diagnostico.recomendaciones.push('Ejecutar: app.state.channels = [...app.state.channelsMaster]; app.renderTable();');
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 2: VERIFICAR INDEXEDDB
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('💾 FASE 2: Estado de IndexedDB');
    console.log('─────────────────────────────────────────────────────────────────────');

    let idbChannels = 0;
    let idbServers = 0;

    try {
        const db = app?.db || window.dbManager;

        if (db && db.db) {
            // Contar canales en IDB
            const channelsPromise = new Promise((resolve) => {
                const tx = db.db.transaction(['channels'], 'readonly');
                const store = tx.objectStore('channels');
                const countReq = store.count();
                countReq.onsuccess = () => resolve(countReq.result);
                countReq.onerror = () => resolve(0);
            });

            idbChannels = await channelsPromise;

            // Contar servidores en IDB
            const serversPromise = new Promise((resolve) => {
                const tx = db.db.transaction(['servers'], 'readonly');
                const store = tx.objectStore('servers');
                const countReq = store.count();
                countReq.onsuccess = () => resolve(countReq.result);
                countReq.onerror = () => resolve(0);
            });

            idbServers = await serversPromise;
        }

        console.table({
            'Canales en IndexedDB': idbChannels,
            'Servidores en IndexedDB': idbServers
        });

        if (idbChannels === 0) {
            diagnostico.problemas.push('❌ IndexedDB está VACÍO (0 canales persistidos)');
            diagnostico.recomendaciones.push('Los canales no se guardaron o fueron eliminados. Necesitas reconectar al servidor.');
        }

        if (idbChannels > 0 && ramState.channelsMaster === 0) {
            diagnostico.problemas.push(`⚠️ IndexedDB tiene ${idbChannels} canales pero RAM está vacía`);
            diagnostico.recomendaciones.push('Ejecutar: await app.loadChannelsList(); app.renderTable();');
        }

    } catch (error) {
        console.error('Error accediendo a IndexedDB:', error);
        diagnostico.problemas.push('❌ Error accediendo a IndexedDB');
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 3: VERIFICAR SERVIDORES ACTIVOS
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('🖥️ FASE 3: Servidores Activos');
    console.log('─────────────────────────────────────────────────────────────────────');

    const activeServers = app?.state?.activeServers || [];

    if (activeServers.length === 0) {
        console.log('⚠️ No hay servidores activos');
        diagnostico.problemas.push('❌ No hay servidores activos registrados');
    } else {
        activeServers.forEach((srv, i) => {
            console.log(`   ${i + 1}. ${srv.name || srv.id}`);
            console.log(`      ID: ${srv.id}`);
            console.log(`      URL: ${srv.baseUrl || srv.url}`);
            console.log(`      Channels: ${srv.channelCount || srv.snapshot?.channelsCount || 'N/A'}`);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 4: VERIFICAR CANALES HUÉRFANOS
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('👻 FASE 4: Canales Huérfanos');
    console.log('─────────────────────────────────────────────────────────────────────');

    const serverIds = new Set(activeServers.map(s => s.id));
    const orphanedChannels = (app?.state?.channelsMaster || []).filter(ch =>
        ch.serverId && !serverIds.has(ch.serverId)
    );

    console.log(`   Canales totales: ${ramState.channelsMaster}`);
    console.log(`   Canales huérfanos: ${orphanedChannels.length}`);

    if (orphanedChannels.length > 0) {
        diagnostico.problemas.push(`⚠️ ${orphanedChannels.length} canales huérfanos detectados`);
        diagnostico.recomendaciones.push('Ejecutar: await app.deepCleanOrphanedChannels();');

        // Mostrar qué serverIds son huérfanos
        const orphanServerIds = [...new Set(orphanedChannels.map(ch => ch.serverId))];
        console.log(`   Server IDs huérfanos: ${orphanServerIds.join(', ')}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 5: VERIFICAR FILTROS
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('🔎 FASE 5: Estado de Filtros');
    console.log('─────────────────────────────────────────────────────────────────────');

    const filterState = app?.state?.filterState || app?.filterState || {};
    console.log('   Filtros activos:', JSON.stringify(filterState, null, 2));

    if (ramState.channelsMaster > 0 && ramState.channels === 0) {
        diagnostico.problemas.push('⚠️ Filtros muy restrictivos eliminan todos los canales');
        diagnostico.recomendaciones.push('Ejecutar: app.state.channels = [...app.state.channelsMaster]; app.applyFilters(); app.renderTable();');
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 6: VERIFICAR ÚLTIMA API RESPONSE
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('🌐 FASE 6: Última Respuesta de API');
    console.log('─────────────────────────────────────────────────────────────────────');

    const lastApiResponse = app?.lastApiResponse || app?._lastApiResponse || null;
    if (lastApiResponse) {
        console.log(`   Canales en última respuesta: ${Array.isArray(lastApiResponse) ? lastApiResponse.length : 'No es array'}`);
    } else {
        console.log('   ℹ️ No hay registro de última respuesta API');
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESUMEN FINAL
    // ═══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('📊 RESUMEN DEL DIAGNÓSTICO');
    console.log('═══════════════════════════════════════════════════════════════════════');

    if (diagnostico.problemas.length === 0) {
        console.log('✅ No se detectaron problemas críticos');
    } else {
        console.log('❌ PROBLEMAS DETECTADOS:');
        diagnostico.problemas.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
    }

    if (diagnostico.recomendaciones.length > 0) {
        console.log('');
        console.log('💡 RECOMENDACIONES:');
        diagnostico.recomendaciones.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));
    }

    console.log('═══════════════════════════════════════════════════════════════════════');

    return diagnostico;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 SCRIPT 2: REPARACIÓN AUTOMÁTICA
// ═══════════════════════════════════════════════════════════════════════════════

async function reparacionAutomatica() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║ 🔧 REPARACIÓN AUTOMÁTICA                                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    let reparaciones = 0;

    try {
        // 1. Verificar si IndexedDB tiene datos
        const db = app?.db || window.dbManager;
        let idbChannels = [];

        if (db && db.db) {
            idbChannels = await new Promise((resolve) => {
                const tx = db.db.transaction(['channels'], 'readonly');
                const store = tx.objectStore('channels');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        }

        console.log(`📊 Canales en IndexedDB: ${idbChannels.length}`);
        console.log(`📊 Canales en RAM: ${app?.state?.channelsMaster?.length || 0}`);

        // 2. Si IndexedDB tiene datos pero RAM no, cargar desde IDB
        if (idbChannels.length > 0 && (app?.state?.channelsMaster?.length || 0) === 0) {
            console.log('🔄 Restaurando canales desde IndexedDB...');
            app.state.channelsMaster = idbChannels;
            app.state.channels = [...idbChannels];
            reparaciones++;
            console.log(`   ✅ ${idbChannels.length} canales restaurados`);
        }

        // 3. Si channelsMaster tiene datos pero channels no, sincronizar
        if ((app?.state?.channelsMaster?.length || 0) > 0 && (app?.state?.channels?.length || 0) === 0) {
            console.log('🔄 Sincronizando channels con channelsMaster...');
            app.state.channels = [...app.state.channelsMaster];
            reparaciones++;
            console.log(`   ✅ ${app.state.channels.length} canales sincronizados`);
        }

        // 4. Limpiar canales huérfanos
        const serverIds = new Set((app?.state?.activeServers || []).map(s => s.id));
        const orphanCount = (app?.state?.channelsMaster || []).filter(ch =>
            ch.serverId && !serverIds.has(ch.serverId)
        ).length;

        if (orphanCount > 0) {
            console.log(`🔄 Limpiando ${orphanCount} canales huérfanos...`);
            app.state.channelsMaster = app.state.channelsMaster.filter(ch =>
                !ch.serverId || serverIds.has(ch.serverId)
            );
            app.state.channels = [...app.state.channelsMaster];
            reparaciones++;
            console.log('   ✅ Huérfanos eliminados');
        }

        // 5. Forzar renderizado
        console.log('🔄 Forzando renderizado de tabla...');
        if (typeof app.renderTable === 'function') {
            app.renderTable();
            reparaciones++;
            console.log('   ✅ Tabla renderizada');
        }

        // 6. Actualizar estadísticas
        if (typeof app.calculateStats === 'function') {
            app.calculateStats();
        }
        if (typeof app.updateStatsUI === 'function') {
            app.updateStatsUI();
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log(`✅ REPARACIÓN COMPLETADA: ${reparaciones} acciones ejecutadas`);
        console.log(`📊 Canales ahora visibles: ${app?.state?.channels?.length || 0}`);
        console.log('═══════════════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error durante reparación:', error);
    }

    return reparaciones;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🌐 SCRIPT 3: RECONECTAR Y RECARGAR CANALES
// ═══════════════════════════════════════════════════════════════════════════════

async function reconectarServidores() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║ 🌐 RECONECTANDO SERVIDORES                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const activeServers = app?.state?.activeServers || [];

    if (activeServers.length === 0) {
        console.log('❌ No hay servidores activos para reconectar');
        console.log('💡 Usa la UI para conectar un nuevo servidor');
        return;
    }

    let totalChannels = 0;

    for (const server of activeServers) {
        console.log(`🔌 Reconectando: ${server.name || server.id}...`);

        try {
            const baseUrl = (server.baseUrl || server.url || '').replace('/player_api.php', '');
            const username = server.username;
            const password = server.password;

            if (!baseUrl || !username || !password) {
                console.log(`   ⚠️ Credenciales incompletas para ${server.name}`);
                continue;
            }

            // Llamar a la API
            const apiUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
            console.log(`   📡 API: ${apiUrl.substring(0, 60)}...`);

            const response = await fetch(apiUrl);
            const channels = await response.json();

            if (Array.isArray(channels) && channels.length > 0) {
                console.log(`   ✅ ${channels.length} canales recibidos`);

                // Asignar serverId a cada canal
                channels.forEach((ch, idx) => {
                    ch.serverId = server.id;
                    ch.serverName = server.name;
                    if (!ch.id) ch.id = ch.stream_id || `${server.id}_${idx}`;
                });

                // Agregar a channelsMaster
                app.state.channelsMaster = app.state.channelsMaster || [];

                // Remover canales antiguos de este servidor
                app.state.channelsMaster = app.state.channelsMaster.filter(ch => ch.serverId !== server.id);

                // Agregar nuevos
                app.state.channelsMaster.push(...channels);
                totalChannels += channels.length;

            } else {
                console.log(`   ⚠️ API retornó: ${Array.isArray(channels) ? '0 canales' : 'respuesta inválida'}`);
            }

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    // Sincronizar y renderizar
    app.state.channels = [...app.state.channelsMaster];

    console.log('');
    console.log('🔄 Persistiendo en IndexedDB...');
    if (typeof app.saveChannelsList === 'function') {
        await app.saveChannelsList();
        console.log('   ✅ Canales guardados');
    }

    console.log('🔄 Renderizando tabla...');
    if (typeof app.renderTable === 'function') {
        app.renderTable();
    }
    if (typeof app.calculateStats === 'function') {
        app.calculateStats();
    }
    if (typeof app.updateStatsUI === 'function') {
        app.updateStatsUI();
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`✅ RECONEXIÓN COMPLETADA`);
    console.log(`📊 Total canales: ${totalChannels}`);
    console.log(`📊 Canales en RAM: ${app?.state?.channelsMaster?.length || 0}`);
    console.log('═══════════════════════════════════════════════════════════════════════');

    return totalChannels;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 EXPORT GLOBAL
// ═══════════════════════════════════════════════════════════════════════════════

window.diagnosticoCompleto = diagnosticoCompleto;
window.reparacionAutomatica = reparacionAutomatica;
window.reconectarServidores = reconectarServidores;

// Alias cortos
window.diagnostico = diagnosticoCompleto;
window.reparar = reparacionAutomatica;
window.reconectar = reconectarServidores;

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════════════╗');
console.log('║ 🔍 DIAGNÓSTICO URGENTE - Scripts Cargados                            ║');
console.log('╠═══════════════════════════════════════════════════════════════════════╣');
console.log('║ Comandos disponibles:                                                ║');
console.log('║                                                                      ║');
console.log('║   await diagnostico()    - Ver estado completo del sistema           ║');
console.log('║   await reparar()        - Intentar reparación automática            ║');
console.log('║   await reconectar()     - Reconectar servidores y recargar canales  ║');
console.log('║                                                                      ║');
console.log('║ Orden recomendado:                                                   ║');
console.log('║   1. await diagnostico()                                             ║');
console.log('║   2. await reparar()                                                 ║');
console.log('║   3. Si sigue vacío: await reconectar()                              ║');
console.log('╚═══════════════════════════════════════════════════════════════════════╝');
console.log('');
