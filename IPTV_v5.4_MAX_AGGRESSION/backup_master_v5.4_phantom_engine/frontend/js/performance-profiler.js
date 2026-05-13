/**
 * ═══════════════════════════════════════════════════════════════════
 * ⏱️ PERFORMANCE PROFILER V1.0
 * Perfilado liviano para marcas de tiempo y diagnóstico
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Proporciona:
 * - Marcas de tiempo para medir operaciones
 * - Historial de métricas
 * - Alertas de performance budget
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // ⏱️ PERFORMANCE PROFILER
    // ═══════════════════════════════════════════════════════════════════

    const PerformanceProfiler = {
        version: '1.0.0',

        // Estado
        marks: {},
        measurements: [],
        budgets: {
            'generation': 10000,   // 10s máximo para generación
            'tabSwitch': 200,      // 200ms máximo para cambio de pestaña
            'render': 500,         // 500ms máximo para renderizado
            'hibernation': 100     // 100ms máximo para hibernación
        },

        // ═══════════════════════════════════════════════════════════════
        // 📏 MARKING & MEASURING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Iniciar una marca de tiempo
         * @param {string} name - Nombre de la marca
         */
        mark(name) {
            this.marks[name] = performance.now();
            return this;
        },

        /**
         * Finalizar una marca y medir el tiempo
         * @param {string} name - Nombre de la marca
         * @returns {number} Duración en ms
         */
        measure(name) {
            if (!this.marks[name]) {
                console.warn(`[Profiler] ⚠️ Marca '${name}' no encontrada`);
                return -1;
            }

            const duration = performance.now() - this.marks[name];

            const measurement = {
                name: name,
                duration: Math.round(duration * 100) / 100,
                timestamp: Date.now(),
                budgetExceeded: this._checkBudget(name, duration)
            };

            this.measurements.push(measurement);
            delete this.marks[name];

            // Log con formato condicional
            if (measurement.budgetExceeded) {
                console.warn(`[Profiler] ⚠️ ${name}: ${measurement.duration}ms (EXCEDE BUDGET de ${this.budgets[name]}ms)`);
            } else {
                console.log(`[Profiler] ⏱️ ${name}: ${measurement.duration}ms`);
            }

            return measurement.duration;
        },

        /**
         * Medir una función async automáticamente
         * @param {string} name - Nombre de la operación
         * @param {Function} fn - Función async a medir
         */
        async profile(name, fn) {
            this.mark(name);
            try {
                const result = await fn();
                this.measure(name);
                return result;
            } catch (error) {
                this.measure(name);
                throw error;
            }
        },

        /**
         * Medir una función sync automáticamente
         * @param {string} name - Nombre de la operación
         * @param {Function} fn - Función a medir
         */
        profileSync(name, fn) {
            this.mark(name);
            try {
                const result = fn();
                this.measure(name);
                return result;
            } catch (error) {
                this.measure(name);
                throw error;
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 📊 BUDGET CHECKING
        // ═══════════════════════════════════════════════════════════════

        _checkBudget(name, duration) {
            // Verificar si algún budget aplica
            for (const [budgetName, maxDuration] of Object.entries(this.budgets)) {
                if (name.toLowerCase().includes(budgetName.toLowerCase())) {
                    return duration > maxDuration;
                }
            }
            return false;
        },

        /**
         * Definir un budget personalizado
         * @param {string} name - Nombre del budget
         * @param {number} maxMs - Duración máxima en ms
         */
        setBudget(name, maxMs) {
            this.budgets[name] = maxMs;
            console.log(`[Profiler] 📋 Budget '${name}' establecido: ${maxMs}ms`);
        },

        // ═══════════════════════════════════════════════════════════════
        // 📈 STATISTICS & REPORTING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Obtener resumen de mediciones
         */
        getSummary() {
            const byName = {};

            this.measurements.forEach(m => {
                if (!byName[m.name]) {
                    byName[m.name] = {
                        count: 0,
                        totalDuration: 0,
                        min: Infinity,
                        max: 0,
                        budgetExceeds: 0
                    };
                }

                const stats = byName[m.name];
                stats.count++;
                stats.totalDuration += m.duration;
                stats.min = Math.min(stats.min, m.duration);
                stats.max = Math.max(stats.max, m.duration);
                if (m.budgetExceeded) stats.budgetExceeds++;
            });

            // Calcular promedios
            Object.keys(byName).forEach(name => {
                const stats = byName[name];
                stats.avg = Math.round(stats.totalDuration / stats.count * 100) / 100;
                stats.min = stats.min === Infinity ? 0 : stats.min;
            });

            return byName;
        },

        /**
         * Obtener últimas N mediciones
         * @param {number} count - Cantidad de mediciones
         */
        getRecent(count = 10) {
            return this.measurements.slice(-count);
        },

        /**
         * Obtener mediciones que excedieron budget
         */
        getBudgetViolations() {
            return this.measurements.filter(m => m.budgetExceeded);
        },

        /**
         * Limpiar historial de mediciones
         */
        clear() {
            this.measurements = [];
            this.marks = {};
            console.log('[Profiler] 🧹 Historial limpiado');
        },

        // ═══════════════════════════════════════════════════════════════
        // 🖨️ REPORTING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Imprimir resumen en consola
         */
        printSummary() {
            const summary = this.getSummary();

            console.group('📊 Performance Summary');

            Object.entries(summary).forEach(([name, stats]) => {
                const status = stats.budgetExceeds > 0 ? '⚠️' : '✅';
                console.log(`${status} ${name}: avg=${stats.avg}ms, min=${stats.min}ms, max=${stats.max}ms, count=${stats.count}`);
            });

            console.groupEnd();
        },

        /**
         * Exportar mediciones como JSON
         */
        exportJSON() {
            return JSON.stringify({
                version: this.version,
                exportedAt: new Date().toISOString(),
                budgets: this.budgets,
                summary: this.getSummary(),
                measurements: this.measurements
            }, null, 2);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 GLOBAL EXPORT
    // ═══════════════════════════════════════════════════════════════════

    window.PerformanceProfiler = PerformanceProfiler;
    window.profiler = PerformanceProfiler; // Alias corto

    console.log(`[Profiler] ⏱️ v${PerformanceProfiler.version} cargado`);

})();
