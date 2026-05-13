/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔧 ADAPTER v14 CONFIG - Proveedor de Configuración UI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROPÓSITO: Extraer y centralizar la lectura de configuración desde la UI
 * para alimentar al núcleo v16.0 WORLD CLASS.
 * 
 * FUNCIONALIDADES EXTRAÍDAS DE m3u8-generator-v14-supremo.js:
 * - getUIGeneratorOptions() → Lectura de paneles UI
 * - Integración con GroupTitleBuilder
 * - Integración con ProfileManagerV9
 * 
 * ARQUITECTURA: Este adaptador NO genera M3U8. Solo provee configuración.
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0-ADAPTER';

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 LECTURA DE CONFIGURACIÓN DE LA UI
     * ═══════════════════════════════════════════════════════════════
     */
    function getConfigFromUI() {
        const $ = (id) => document.getElementById(id);

        // ══════════════════════════════════════════════════════
        // 1. OPCIONES DE GENERACIÓN
        // ══════════════════════════════════════════════════════
        const generation = {
            exportFormat: $('genExportFormat')?.value || 'm3u8',
            epgUrl: $('genEpgUrl')?.value || '',
            streamFormat: $('genStreamFormat')?.value || 'm3u8',
            timeShift: parseInt($('genTimeShift')?.value || '0', 10)
        };

        // ══════════════════════════════════════════════════════
        // 2. OPTIMIZACIÓN DE STREAMING
        // ══════════════════════════════════════════════════════
        const streaming = {
            proStreamingEnabled: !!$('proStreamingOptimized')?.checked,
            ottNavOptimized: !!$('ottNavOptimizedGen')?.checked,
            includeHttpHeaders: $('includeHttpHeaders')?.checked !== false
        };

        // ══════════════════════════════════════════════════════
        // 3. MOTOR APE - CONFIGURACIÓN
        // ══════════════════════════════════════════════════════
        const motorAPE = {
            autoDetectLevel: $('v41AutoDetectLevel')?.checked !== false,
            manualEvasionLevel: parseInt($('manualEvasionLevel')?.value || '3', 10),
            antiFreezeLevel: parseInt($('antiFreezeLevel')?.value || '3', 10),
            targetPlayer: $('v41TargetPlayer')?.value || 'generic',
            compatProfile: $('v41CompatProfile')?.value || 'AUTO'
        };

        // Mapeo de headers según nivel de evasión
        const evasionHeaderCounts = { 1: 28, 2: 58, 3: 92, 4: 128, 5: 154 };
        motorAPE.headerCount = evasionHeaderCounts[motorAPE.manualEvasionLevel] || 92;

        // ══════════════════════════════════════════════════════
        // 4. SERVERLESS (v5.0)
        // ══════════════════════════════════════════════════════
        const serverless = {
            enabled: !!$('v5UseServerless')?.checked,
            workerUrl: $('v5WorkerUrl')?.value || '',
            apiKey: $('v5ApiKey')?.value || ''
        };

        // ══════════════════════════════════════════════════════
        // 5. GROUP-TITLE CONFIG (GroupTitleConfigManager)
        // ══════════════════════════════════════════════════════
        let groupTitleConfig = null;
        if (window.GroupTitleConfigManager) {
            try {
                groupTitleConfig = window.GroupTitleConfigManager.load();
            } catch (e) {
                console.warn('[AdapterV14] GroupTitleConfigManager no disponible:', e);
            }
        }

        // ══════════════════════════════════════════════════════
        // 6. PERFIL ACTIVO (ProfileManagerV9)
        // ══════════════════════════════════════════════════════
        let activeProfile = 'P3';
        let customHeaders = [];
        if (window.ProfileManagerV9) {
            try {
                activeProfile = window.ProfileManagerV9.getCurrentProfile?.() || 'P3';
                customHeaders = window.ProfileManagerV9.getActiveCustomHeaders?.() || [];
            } catch (e) {
                console.warn('[AdapterV14] ProfileManagerV9 error:', e);
            }
        }

        // ══════════════════════════════════════════════════════
        // 7. QUALITY PROFILE SELECTOR (si existe)
        // ══════════════════════════════════════════════════════
        const qualityProfile = $('qualityProfile')?.value || $('apeQualityProfile')?.value || activeProfile;

        // ══════════════════════════════════════════════════════
        // 8. VIDEO FORMAT MODULE (si está disponible)
        // ══════════════════════════════════════════════════════
        let videoFormatConfig = null;
        if (window.VideoFormatPrioritizationModule) {
            try {
                videoFormatConfig = {
                    priority: window.VideoFormatPrioritizationModule.getFormatPriority?.() || [],
                    enabled: true
                };
            } catch (e) {
                console.warn('[AdapterV14] VideoFormatModule error:', e);
            }
        }

        // ══════════════════════════════════════════════════════
        // RESULTADO CONSOLIDADO
        // ══════════════════════════════════════════════════════
        return {
            // Configuración de generación
            generation,
            streaming,
            motorAPE,
            serverless,

            // Metadatos de grupo
            groupTitle: groupTitleConfig,

            // Perfiles y headers personalizados
            activeProfile: qualityProfile,
            customHeaders,
            videoFormat: videoFormatConfig,

            // Nivel efectivo de evasión
            effectiveEvasionLevel: motorAPE.autoDetectLevel ? null : motorAPE.manualEvasionLevel,
            optimizationLevel: motorAPE.manualEvasionLevel,

            // Metadata
            timestamp: new Date().toISOString(),
            adapterVersion: VERSION
        };
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🏷️ PROCESADOR DE GROUP-TITLE DINÁMICO
     * ═══════════════════════════════════════════════════════════════
     */
    function processGroupTitle(channel) {
        if (window.GroupTitleBuilder && typeof window.GroupTitleBuilder.buildExport === 'function') {
            try {
                const dynamicGroup = window.GroupTitleBuilder.buildExport(channel);
                if (dynamicGroup && dynamicGroup.trim() !== '') {
                    return dynamicGroup;
                }
            } catch (e) {
                console.warn('[AdapterV14] GroupTitleBuilder error:', e);
            }
        }
        return channel.group || channel.groupTitle || channel.category_name || 'General';
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📊 ESTADÍSTICAS DE CONFIGURACIÓN
     * ═══════════════════════════════════════════════════════════════
     */
    function getConfigStats() {
        const config = getConfigFromUI();
        return {
            profile: config.activeProfile,
            evasionLevel: config.optimizationLevel,
            headerCount: config.motorAPE.headerCount,
            customHeadersCount: config.customHeaders.length,
            streamFormat: config.generation.streamFormat,
            proStreaming: config.streaming.proStreamingEnabled,
            ottOptimized: config.streaming.ottNavOptimized,
            serverlessEnabled: config.serverless.enabled,
            groupTitleConfigured: !!config.groupTitle,
            videoFormatEnabled: !!config.videoFormat
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════

    window.AdapterV14 = {
        getConfigFromUI,
        processGroupTitle,
        getConfigStats,
        version: VERSION
    };

    console.log(`%c🔧 Adapter v14 Config v${VERSION} Loaded`, 'color: #8b5cf6; font-weight: bold;');
    console.log('   ✅ getConfigFromUI() → Lee configuración de UI');
    console.log('   ✅ processGroupTitle(channel) → Jerarquía de grupos');

})();
