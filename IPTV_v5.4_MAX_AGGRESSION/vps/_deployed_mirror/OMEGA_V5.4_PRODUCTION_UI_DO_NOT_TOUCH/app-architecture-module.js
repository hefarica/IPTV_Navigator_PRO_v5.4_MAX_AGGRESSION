/**
 * APP-ARCHITECTURE-MODULE.js
 * IPTV Navigator PRO - Módulo de Arquitectura y Event Bus v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Event Bus para comunicación desacoplada entre módulos
 * - Service Locator pattern para registro de servicios
 * - State Manager simplificado
 * - Hooks lifecycle para módulos
 * 
 * ✅ PRINCIPIOS:
 * - Separación de concerns
 * - Bajo acoplamiento entre módulos
 * - Extensibilidad sin modificar código existente
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. EVENT BUS (Pub/Sub Pattern)
// ═══════════════════════════════════════════════════════════════════════════

class EventBus {
    constructor() {
        this._listeners = new Map();
        this._onceListeners = new Map();
        this._eventHistory = [];
        this._historyMaxSize = 100;
    }

    /**
     * Suscribirse a un evento
     * @param {string} event - Nombre del evento
     * @param {Function} callback - Función a ejecutar
     * @param {object} context - Contexto (this) para el callback
     * @returns {Function} Función para desuscribirse
     */
    on(event, callback, context = null) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }

        const listener = { callback, context };
        this._listeners.get(event).push(listener);

        // Retornar función para unsubscribe
        return () => this.off(event, callback);
    }

    /**
     * Suscribirse a un evento (solo una vez)
     */
    once(event, callback, context = null) {
        if (!this._onceListeners.has(event)) {
            this._onceListeners.set(event, []);
        }
        this._onceListeners.get(event).push({ callback, context });
    }

    /**
     * Desuscribirse de un evento
     */
    off(event, callback) {
        if (this._listeners.has(event)) {
            const listeners = this._listeners.get(event);
            const filtered = listeners.filter(l => l.callback !== callback);
            this._listeners.set(event, filtered);
        }
    }

    /**
     * Emitir un evento
     * @param {string} event - Nombre del evento
     * @param {any} data - Datos a pasar a los listeners
     */
    emit(event, data = null) {
        const timestamp = Date.now();

        // Guardar en historial
        this._eventHistory.push({ event, data, timestamp });
        if (this._eventHistory.length > this._historyMaxSize) {
            this._eventHistory.shift();
        }

        // Ejecutar listeners permanentes
        if (this._listeners.has(event)) {
            this._listeners.get(event).forEach(({ callback, context }) => {
                try {
                    callback.call(context, data, event);
                } catch (e) {
                    console.error(`[EventBus] Error in listener for "${event}":`, e);
                }
            });
        }

        // Ejecutar listeners de una vez
        if (this._onceListeners.has(event)) {
            const onceListeners = this._onceListeners.get(event);
            this._onceListeners.delete(event);

            onceListeners.forEach(({ callback, context }) => {
                try {
                    callback.call(context, data, event);
                } catch (e) {
                    console.error(`[EventBus] Error in once listener for "${event}":`, e);
                }
            });
        }
    }

    /**
     * Obtener historial de eventos recientes
     */
    getHistory(eventFilter = null) {
        if (eventFilter) {
            return this._eventHistory.filter(e => e.event === eventFilter);
        }
        return [...this._eventHistory];
    }

    /**
     * Limpiar todos los listeners
     */
    clear() {
        this._listeners.clear();
        this._onceListeners.clear();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SERVICE LOCATOR (Registro de Servicios)
// ═══════════════════════════════════════════════════════════════════════════

class ServiceLocator {
    constructor() {
        this._services = new Map();
        this._factories = new Map();
    }

    /**
     * Registrar un servicio singleton
     * @param {string} name - Nombre del servicio
     * @param {any} instance - Instancia del servicio
     */
    register(name, instance) {
        if (this._services.has(name)) {
            console.warn(`[ServiceLocator] Service "${name}" already registered, replacing...`);
        }
        this._services.set(name, instance);
        console.log(`✅ [ServiceLocator] Registered: ${name}`);
    }

    /**
     * Registrar una factory para creación lazy
     * @param {string} name - Nombre del servicio
     * @param {Function} factory - Función que crea el servicio
     */
    registerFactory(name, factory) {
        this._factories.set(name, factory);
    }

    /**
     * Obtener un servicio
     * @param {string} name - Nombre del servicio
     * @returns {any} Instancia del servicio o null
     */
    get(name) {
        // Primero buscar en servicios registrados
        if (this._services.has(name)) {
            return this._services.get(name);
        }

        // Si hay factory, crear y cachear
        if (this._factories.has(name)) {
            const factory = this._factories.get(name);
            const instance = factory();
            this._services.set(name, instance);
            return instance;
        }

        console.warn(`[ServiceLocator] Service "${name}" not found`);
        return null;
    }

    /**
     * Verificar si un servicio está registrado
     */
    has(name) {
        return this._services.has(name) || this._factories.has(name);
    }

    /**
     * Listar todos los servicios registrados
     */
    list() {
        return [...this._services.keys()];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MODULE MANAGER (Lifecycle Hooks)
// ═══════════════════════════════════════════════════════════════════════════

class ModuleManager {
    constructor(eventBus, services) {
        this.eventBus = eventBus;
        this.services = services;
        this._modules = new Map();
        this._initOrder = [];
    }

    /**
     * Registrar un módulo
     * @param {string} name - Nombre del módulo
     * @param {object} module - Instancia del módulo
     * @param {object} options - Opciones
     */
    register(name, module, options = {}) {
        const { priority = 100, autoInit = true } = options;

        this._modules.set(name, {
            instance: module,
            priority,
            initialized: false
        });

        // Mantener orden por prioridad
        this._initOrder.push({ name, priority });
        this._initOrder.sort((a, b) => a.priority - b.priority);

        // Registrar en service locator
        this.services.register(name, module);

        // Auto-inicializar si tiene método init
        if (autoInit && typeof module.init === 'function') {
            this._initModule(name);
        }

        console.log(`✅ [ModuleManager] Module registered: ${name} (priority: ${priority})`);
    }

    /**
     * Inicializar un módulo específico
     */
    async _initModule(name) {
        const moduleEntry = this._modules.get(name);
        if (!moduleEntry || moduleEntry.initialized) return;

        const module = moduleEntry.instance;

        try {
            // Lifecycle: beforeInit
            if (typeof module.beforeInit === 'function') {
                await module.beforeInit();
            }

            // Lifecycle: init
            if (typeof module.init === 'function') {
                await module.init({
                    eventBus: this.eventBus,
                    services: this.services
                });
            }

            // Lifecycle: afterInit
            if (typeof module.afterInit === 'function') {
                await module.afterInit();
            }

            moduleEntry.initialized = true;
            this.eventBus.emit('module:initialized', { name });

            console.log(`✅ [ModuleManager] Module initialized: ${name}`);

        } catch (e) {
            console.error(`❌ [ModuleManager] Error initializing ${name}:`, e);
            this.eventBus.emit('module:error', { name, error: e });
        }
    }

    /**
     * Inicializar todos los módulos en orden de prioridad
     */
    async initAll() {
        console.group('🚀 [ModuleManager] Initializing all modules...');

        for (const { name } of this._initOrder) {
            await this._initModule(name);
        }

        this.eventBus.emit('modules:allInitialized');
        console.groupEnd();
    }

    /**
     * Obtener un módulo
     */
    get(name) {
        const entry = this._modules.get(name);
        return entry ? entry.instance : null;
    }

    /**
     * Listar módulos
     */
    list() {
        return this._initOrder.map(({ name, priority }) => ({
            name,
            priority,
            initialized: this._modules.get(name)?.initialized || false
        }));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. STATE OBSERVER (Observable State)
// ═══════════════════════════════════════════════════════════════════════════

class StateObserver {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this._watchers = new Map();
        this._state = null;
    }

    /**
     * Vincular al estado de la app
     */
    bindState(state) {
        this._state = state;
    }

    /**
     * Observar cambios en una propiedad específica
     * @param {string} path - Path de la propiedad (ej: 'activeServers.length')
     * @param {Function} callback - Función a ejecutar cuando cambie
     */
    watch(path, callback) {
        if (!this._watchers.has(path)) {
            this._watchers.set(path, []);
        }
        this._watchers.get(path).push(callback);

        return () => {
            const watchers = this._watchers.get(path);
            this._watchers.set(path, watchers.filter(w => w !== callback));
        };
    }

    /**
     * Notificar cambio en una propiedad
     */
    notify(path, oldValue, newValue) {
        if (this._watchers.has(path)) {
            this._watchers.get(path).forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (e) {
                    console.error(`[StateObserver] Error in watcher for "${path}":`, e);
                }
            });
        }

        this.eventBus.emit('state:changed', { path, oldValue, newValue });
    }

    /**
     * Obtener valor del estado por path
     */
    get(path) {
        if (!this._state) return undefined;

        const parts = path.split('.');
        let value = this._state;

        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = value[part];
        }

        return value;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. APPLICATION ARCHITECTURE (Facade)
// ═══════════════════════════════════════════════════════════════════════════

class AppArchitecture {
    constructor() {
        // Crear instancias core
        this.eventBus = new EventBus();
        this.services = new ServiceLocator();
        this.modules = new ModuleManager(this.eventBus, this.services);
        this.stateObserver = new StateObserver(this.eventBus);

        // Registrar servicios core
        this.services.register('eventBus', this.eventBus);
        this.services.register('stateObserver', this.stateObserver);

        console.log('🏛️ AppArchitecture v1.0 inicializado');
    }

    /**
     * Conectar con la instancia principal de la app
     */
    connect(appInstance) {
        this.app = appInstance;
        this.services.register('app', appInstance);

        if (appInstance.state) {
            this.stateObserver.bindState(appInstance.state);
        }

        // Emitir evento de conexión
        this.eventBus.emit('app:connected', { app: appInstance });

        console.log('✅ AppArchitecture conectado a app');

        return this;
    }

    /**
     * Registrar y auto-conectar módulos existentes
     */
    autoDiscoverModules() {
        const moduleNames = [
            ['securityModule', 'SecurityValidationModule'],
            ['persistenceHardening', 'PersistenceHardeningModule'],
            ['performanceOptimization', 'PerformanceOptimizationModule']
        ];

        moduleNames.forEach(([appProp, globalName]) => {
            if (this.app && this.app[appProp]) {
                this.modules.register(appProp, this.app[appProp], { autoInit: false });
            } else if (window[globalName]) {
                const instance = new window[globalName](this.app);
                if (this.app) this.app[appProp] = instance;
                this.modules.register(appProp, instance, { autoInit: false });
            }
        });

        console.log(`✅ Auto-discovered ${this.modules.list().length} modules`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EVENTOS ESTÁNDAR (Definición)
// ═══════════════════════════════════════════════════════════════════════════

const AppEvents = {
    // App lifecycle
    APP_READY: 'app:ready',
    APP_CONNECTED: 'app:connected',

    // Server events
    SERVER_CONNECTING: 'server:connecting',
    SERVER_CONNECTED: 'server:connected',
    SERVER_DISCONNECTED: 'server:disconnected',
    SERVER_ERROR: 'server:error',

    // Channel events
    CHANNELS_LOADING: 'channels:loading',
    CHANNELS_LOADED: 'channels:loaded',
    CHANNELS_UPDATED: 'channels:updated',
    CHANNELS_ENRICHED: 'channels:enriched',

    // Persistence events
    STATE_SAVING: 'state:saving',
    STATE_SAVED: 'state:saved',
    STATE_LOADED: 'state:loaded',
    STATE_CHANGED: 'state:changed',

    // Security events
    SECURITY_VALIDATION_FAILED: 'security:validationFailed',
    SECURITY_SSRF_BLOCKED: 'security:ssrfBlocked',

    // UI events
    TAB_CHANGED: 'ui:tabChanged',
    FILTER_APPLIED: 'ui:filterApplied',
    RENDER_COMPLETE: 'ui:renderComplete'
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR GLOBALMENTE
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.EventBus = EventBus;
    window.ServiceLocator = ServiceLocator;
    window.ModuleManager = ModuleManager;
    window.StateObserver = StateObserver;
    window.AppArchitecture = AppArchitecture;
    window.AppEvents = AppEvents;

    // Crear instancia global
    window.appArch = new AppArchitecture();

    console.log('🏛️ AppArchitecture disponible en window.appArch');
    console.log('📢 AppEvents disponible en window.AppEvents');
}
