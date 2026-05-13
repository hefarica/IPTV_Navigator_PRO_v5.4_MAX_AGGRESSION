/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              USER AGENT ROTATION MODULE v3.0.0                           ║
 * ║                    APE ULTIMATE - DYNAMIC ROTATION                        ║
 * ║                                                                           ║
 * ║  Módulo de rotación dinámica de 2500+ User Agents reales                 ║
 * ║  Soporta: Selección aleatoria, por categoría, por dispositivo            ║
 * ║  Características: Persistencia de sesión, estadísticas, logging           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

class UserAgentRotationModule {
    
    constructor(userAgentsDatabase = null) {
        this.database = userAgentsDatabase || {};
        this.sessionUserAgents = new Map();
        this.statistics = {
            totalSelections: 0,
            selectionsByCategory: {},
            selectionsByDevice: {},
            successRate: 0,
            totalAttempts: 0,
            successfulAttempts: 0,
            failedAttempts: 0
        };
        this.usageHistory = [];
        this.maxHistorySize = 1000;
        this.config = {
            persistSession: true,
            enableLogging: true,
            enableStatistics: true,
            storagePrefix: 'ua_rotation_'
        };
        
        this.initializeStatistics();
    }
    
    /**
     * PASO 1: Inicializar estadísticas por categoría
     */
    initializeStatistics() {
        Object.keys(this.database).forEach(category => {
            this.statistics.selectionsByCategory[category] = 0;
        });
    }
    
    /**
     * PASO 2: Seleccionar User Agent aleatorio
     */
    selectRandomUserAgent() {
        try {
            const categories = Object.keys(this.database);
            if (categories.length === 0) {
                throw new Error('Base de datos de User Agents vacía');
            }
            
            // Seleccionar categoría aleatoria (ponderada)
            const category = this.selectWeightedCategory(categories);
            
            // Seleccionar User Agent de la categoría
            const userAgents = this.database[category];
            if (!userAgents || userAgents.length === 0) {
                throw new Error(`Categoría ${category} vacía`);
            }
            
            const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            // Registrar estadísticas
            this.statistics.totalSelections++;
            this.statistics.selectionsByCategory[category]++;
            
            this.log(`✅ User Agent seleccionado: ${category}`);
            
            return userAgent;
            
        } catch (error) {
            this.error(`Error seleccionando User Agent: ${error.message}`);
            return this.getFallbackUserAgent();
        }
    }
    
    /**
     * PASO 3: Seleccionar User Agent por categoría específica
     */
    selectUserAgentByCategory(category) {
        try {
            if (!this.database[category]) {
                throw new Error(`Categoría ${category} no existe`);
            }
            
            const userAgents = this.database[category];
            if (userAgents.length === 0) {
                throw new Error(`Categoría ${category} vacía`);
            }
            
            const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            // Registrar estadísticas
            this.statistics.totalSelections++;
            this.statistics.selectionsByCategory[category]++;
            
            this.log(`✅ User Agent seleccionado de ${category}`);
            
            return userAgent;
            
        } catch (error) {
            this.error(`Error seleccionando UA de ${category}: ${error.message}`);
            return this.selectRandomUserAgent();
        }
    }
    
    /**
     * PASO 4: Seleccionar User Agent por tipo de dispositivo
     */
    selectUserAgentByDevice(deviceType) {
        try {
            let category;
            
            switch (deviceType.toLowerCase()) {
                case 'mobile':
                case 'smartphone':
                    category = Math.random() > 0.5 ? 'mobile_chrome' : 'mobile_safari';
                    break;
                    
                case 'tablet':
                    category = 'mobile_safari'; // iPad
                    break;
                    
                case 'desktop':
                case 'pc':
                    const desktopCategories = ['chrome_desktop', 'firefox_desktop', 'safari_desktop', 'edge_desktop'];
                    category = desktopCategories[Math.floor(Math.random() * desktopCategories.length)];
                    break;
                    
                case 'tv':
                case 'smart_tv':
                    category = 'smart_tv';
                    break;
                    
                case 'iptv':
                case 'app':
                    category = 'iptv_apps';
                    break;
                    
                case 'linux':
                    category = 'linux_desktop';
                    break;
                    
                default:
                    return this.selectRandomUserAgent();
            }
            
            const userAgent = this.selectUserAgentByCategory(category);
            this.statistics.selectionsByDevice[deviceType] = (this.statistics.selectionsByDevice[deviceType] || 0) + 1;
            
            this.log(`✅ User Agent seleccionado para ${deviceType}`);
            
            return userAgent;
            
        } catch (error) {
            this.error(`Error seleccionando UA para ${deviceType}: ${error.message}`);
            return this.selectRandomUserAgent();
        }
    }
    
    /**
     * PASO 5: Obtener User Agent consistente por sesión
     */
    getSessionUserAgent(sessionId) {
        try {
            if (!sessionId) {
                return this.selectRandomUserAgent();
            }
            
            // Verificar si ya existe User Agent para esta sesión
            if (this.sessionUserAgents.has(sessionId)) {
                const userAgent = this.sessionUserAgents.get(sessionId);
                this.log(`📌 User Agent de sesión ${sessionId} recuperado`);
                return userAgent;
            }
            
            // Crear nuevo User Agent para la sesión
            const userAgent = this.selectRandomUserAgent();
            this.sessionUserAgents.set(sessionId, userAgent);
            
            // Persistir en localStorage si está disponible
            if (this.config.persistSession && typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(
                        this.config.storagePrefix + sessionId,
                        userAgent
                    );
                } catch (e) {
                    this.warn('No se pudo guardar en localStorage');
                }
            }
            
            this.log(`🆕 User Agent de sesión ${sessionId} creado`);
            
            return userAgent;
            
        } catch (error) {
            this.error(`Error obteniendo UA de sesión: ${error.message}`);
            return this.selectRandomUserAgent();
        }
    }
    
    /**
     * PASO 6: Rotar User Agent de sesión
     */
    rotateUserAgent(sessionId) {
        try {
            if (!sessionId) {
                return this.selectRandomUserAgent();
            }
            
            const oldUserAgent = this.sessionUserAgents.get(sessionId);
            const newUserAgent = this.selectRandomUserAgent();
            
            this.sessionUserAgents.set(sessionId, newUserAgent);
            
            // Actualizar localStorage
            if (this.config.persistSession && typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(
                        this.config.storagePrefix + sessionId,
                        newUserAgent
                    );
                } catch (e) {
                    this.warn('No se pudo actualizar localStorage');
                }
            }
            
            this.log(`🔄 User Agent de sesión ${sessionId} rotado`);
            
            return newUserAgent;
            
        } catch (error) {
            this.error(`Error rotando UA de sesión: ${error.message}`);
            return this.selectRandomUserAgent();
        }
    }
    
    /**
     * PASO 7: Registrar uso de User Agent
     */
    recordUsage(userAgent, success = true) {
        try {
            this.statistics.totalAttempts++;
            
            if (success) {
                this.statistics.successfulAttempts++;
            } else {
                this.statistics.failedAttempts++;
            }
            
            // Calcular tasa de éxito
            this.statistics.successRate = 
                (this.statistics.successfulAttempts / this.statistics.totalAttempts * 100).toFixed(2);
            
            // Registrar en historial
            const entry = {
                timestamp: new Date().toISOString(),
                userAgent: userAgent.substring(0, 50) + '...',
                success: success
            };
            
            this.usageHistory.push(entry);
            
            // Limitar tamaño del historial
            if (this.usageHistory.length > this.maxHistorySize) {
                this.usageHistory.shift();
            }
            
            this.log(`📊 Uso registrado: ${success ? '✅' : '❌'}`);
            
        } catch (error) {
            this.error(`Error registrando uso: ${error.message}`);
        }
    }
    
    /**
     * PASO 8: Obtener estadísticas
     */
    getStatistics() {
        return {
            totalSelections: this.statistics.totalSelections,
            totalAttempts: this.statistics.totalAttempts,
            successfulAttempts: this.statistics.successfulAttempts,
            failedAttempts: this.statistics.failedAttempts,
            successRate: this.statistics.successRate + '%',
            selectionsByCategory: this.statistics.selectionsByCategory,
            selectionsByDevice: this.statistics.selectionsByDevice,
            activeSessions: this.sessionUserAgents.size,
            historySize: this.usageHistory.length
        };
    }
    
    /**
     * PASO 9: Obtener distribución de User Agents
     */
    getDistribution() {
        const distribution = {};
        
        Object.keys(this.database).forEach(category => {
            const count = this.database[category].length;
            const percentage = (count / this.getTotalUserAgents() * 100).toFixed(2);
            
            distribution[category] = {
                count: count,
                percentage: percentage + '%',
                selected: this.statistics.selectionsByCategory[category] || 0
            };
        });
        
        return distribution;
    }
    
    /**
     * PASO 10: Obtener historial de uso
     */
    getUsageHistory(limit = 50) {
        return this.usageHistory.slice(-limit);
    }
    
    /**
     * PASO 11: Limpiar sesión
     */
    clearSession(sessionId) {
        try {
            this.sessionUserAgents.delete(sessionId);
            
            // Limpiar localStorage
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.removeItem(this.config.storagePrefix + sessionId);
                } catch (e) {
                    this.warn('No se pudo limpiar localStorage');
                }
            }
            
            this.log(`🗑️ Sesión ${sessionId} limpiada`);
            
        } catch (error) {
            this.error(`Error limpiando sesión: ${error.message}`);
        }
    }
    
    /**
     * PASO 12: Limpiar todas las sesiones
     */
    clearAllSessions() {
        try {
            this.sessionUserAgents.clear();
            
            // Limpiar localStorage
            if (typeof localStorage !== 'undefined') {
                try {
                    const keys = Object.keys(localStorage);
                    keys.forEach(key => {
                        if (key.startsWith(this.config.storagePrefix)) {
                            localStorage.removeItem(key);
                        }
                    });
                } catch (e) {
                    this.warn('No se pudo limpiar localStorage');
                }
            }
            
            this.log('🗑️ Todas las sesiones limpiadas');
            
        } catch (error) {
            this.error(`Error limpiando sesiones: ${error.message}`);
        }
    }
    
    /**
     * UTILIDADES
     */
    
    /**
     * Seleccionar categoría ponderada
     */
    selectWeightedCategory(categories) {
        // Ponderación basada en uso real de navegadores
        const weights = {
            'chrome_desktop': 0.30,
            'mobile_chrome': 0.20,
            'firefox_desktop': 0.15,
            'mobile_safari': 0.15,
            'safari_desktop': 0.10,
            'edge_desktop': 0.05,
            'iptv_apps': 0.02,
            'linux_desktop': 0.01,
            'smart_tv': 0.01,
            'bots': 0.005,
            'opera_desktop': 0.005,
            'other_browsers': 0.005
        };
        
        const random = Math.random();
        let cumulative = 0;
        
        for (const category of categories) {
            cumulative += (weights[category] || 0.01);
            if (random <= cumulative) {
                return category;
            }
        }
        
        return categories[0];
    }
    
    /**
     * Obtener User Agent de fallback
     */
    getFallbackUserAgent() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    }
    
    /**
     * Obtener total de User Agents
     */
    getTotalUserAgents() {
        return Object.values(this.database)
            .reduce((sum, arr) => sum + (arr.length || 0), 0);
    }
    
    /**
     * Validar User Agent
     */
    validateUserAgent(userAgent) {
        if (!userAgent || typeof userAgent !== 'string') {
            return false;
        }
        
        if (userAgent.length < 10 || userAgent.length > 500) {
            return false;
        }
        
        // Verificar que contiene Mozilla o similar
        const validPatterns = ['Mozilla', 'Opera', 'Wget', 'curl', 'VLC'];
        return validPatterns.some(pattern => userAgent.includes(pattern));
    }
    
    /**
     * LOGGING
     */
    
    log(message) {
        if (this.config.enableLogging) {
            console.log(`[UA-ROTATION] ${message}`);
        }
    }
    
    warn(message) {
        if (this.config.enableLogging) {
            console.warn(`[UA-ROTATION] ⚠️ ${message}`);
        }
    }
    
    error(message) {
        if (this.config.enableLogging) {
            console.error(`[UA-ROTATION] ❌ ${message}`);
        }
    }
    
    /**
     * CONFIGURACIÓN
     */
    
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.log('Configuración actualizada');
    }
    
    getConfig() {
        return { ...this.config };
    }
}

// EXPORTAR
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserAgentRotationModule;
}
