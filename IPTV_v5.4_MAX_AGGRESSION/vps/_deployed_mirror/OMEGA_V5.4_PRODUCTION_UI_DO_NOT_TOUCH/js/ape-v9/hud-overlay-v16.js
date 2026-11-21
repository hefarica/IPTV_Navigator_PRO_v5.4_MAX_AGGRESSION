/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🖥️ HUD OVERLAY v16.0 - Visual Progress System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Extraído de APE Engine v9.0 para integración con el orquestador v16.0.
 * Proporciona feedback visual en tiempo real durante la generación M3U8.
 * 
 * @version 16.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '16.0.0';

    // ═══════════════════════════════════════════════════════════════
    // HUD OVERLAY SYSTEM
    // ═══════════════════════════════════════════════════════════════

    const HUD = {
        overlay: null,
        elements: {},
        startTime: null,
        aborted: false,

        /**
         * Inicializa el HUD
         * @param {number} totalChannels - Total de canales a procesar
         * @param {object} config - Configuración adicional
         */
        init(totalChannels, config = {}) {
            this.startTime = Date.now();
            this.aborted = false;
            window.__APE_GENERATION_ABORTED__ = false;

            // Remover HUD anterior si existe
            const existing = document.getElementById('ape-hud-v16');
            if (existing) existing.remove();

            // Session ID
            const sessionId = config.sessionId || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2)}`;

            // Crear HUD
            const hud = document.createElement('div');
            hud.id = 'ape-hud-v16';
            hud.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(5, 10, 20, 0.98);
                z-index: 999999;
                display: flex; flex-direction: column;
                padding: 40px;
                font-family: 'Courier New', monospace;
                color: #00ff41;
                box-sizing: border-box;
                border: 2px solid #00ff41;
                animation: hudFadeIn 0.3s ease-in;
            `;

            hud.innerHTML = `
                <style>
                    @keyframes hudFadeIn {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                    #ape-hud-v16 button:hover { transform: scale(1.02); }
                </style>
                
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
                    <div>
                        <h1 style="margin: 0; font-size: 28px; text-shadow: 0 0 10px #00ff41;">
                            👑 APE v16.0 WORLD CLASS + MODULAR
                        </h1>
                        <div style="color: #03a9f4; font-size: 14px; margin-top: 5px;">
                            ORCHESTRATOR ACTIVO | SESSION: ${sessionId.slice(0, 8)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 32px; font-weight: bold;" id="ape-counter">0 / ${totalChannels}</div>
                        <div style="color: #888; font-size: 12px;">CANALES PROCESADOS</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P0 IMAX</div>
                        <div style="font-size: 20px; font-weight: bold; color: #ff00ff;" id="stat-p0">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P1 8K</div>
                        <div style="font-size: 20px; font-weight: bold; color: #9c27b0;" id="stat-p1">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P2 4K</div>
                        <div style="font-size: 20px; font-weight: bold; color: #f44336;" id="stat-p2">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P3 FHD</div>
                        <div style="font-size: 20px; font-weight: bold; color: #ff9800;" id="stat-p3">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P4 HD</div>
                        <div style="font-size: 20px; font-weight: bold; color: #ffeb3b;" id="stat-p4">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">P5 SD</div>
                        <div style="font-size: 20px; font-weight: bold; color: #4caf50;" id="stat-p5">0</div>
                    </div>
                </div>

                <div id="ape-log" style="
                    flex: 1;
                    background: #000;
                    border: 1px solid #1a1a1a;
                    padding: 15px;
                    overflow-y: auto;
                    font-size: 11px;
                    line-height: 1.6;
                    margin-bottom: 15px;
                    color: #ccc;
                "></div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">HEADERS</div>
                        <div style="font-size: 16px; color: #8b5cf6;" id="stat-headers">0</div>
                    </div>
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">JWT SIZE</div>
                        <div style="font-size: 16px; color: #03a9f4;" id="stat-jwt">0 KB</div>
                    </div>
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">VELOCIDAD</div>
                        <div style="font-size: 16px; color: #00ff41;" id="stat-speed">0 ch/s</div>
                    </div>
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">TIEMPO</div>
                        <div style="font-size: 16px; color: #ff9800;" id="stat-time">0.0s</div>
                    </div>
                </div>

                <div style="height: 20px; background: #111; border-radius: 10px; overflow: hidden; border: 1px solid #333;">
                    <div id="ape-progress" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, #8b5cf6, #03a9f4, #00ff41);
                        transition: width 0.2s ease-out;
                    "></div>
                </div>

                <button id="ape-cancel" style="
                    margin-top: 20px;
                    background: transparent;
                    border: 2px solid #ff1744;
                    color: #ff1744;
                    padding: 12px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 14px;
                    border-radius: 5px;
                    font-weight: bold;
                    transition: all 0.2s;
                ">
                    ⛔ CANCELAR OPERACIÓN
                </button>
            `;

            document.body.appendChild(hud);

            this.overlay = hud;
            this.elements = {
                log: document.getElementById('ape-log'),
                bar: document.getElementById('ape-progress'),
                counter: document.getElementById('ape-counter'),
                statP0: document.getElementById('stat-p0'),
                statP1: document.getElementById('stat-p1'),
                statP2: document.getElementById('stat-p2'),
                statP3: document.getElementById('stat-p3'),
                statP4: document.getElementById('stat-p4'),
                statP5: document.getElementById('stat-p5'),
                statHeaders: document.getElementById('stat-headers'),
                statJwt: document.getElementById('stat-jwt'),
                statSpeed: document.getElementById('stat-speed'),
                statTime: document.getElementById('stat-time')
            };

            // Cancel button handler — detiene generación real via flag global
            document.getElementById('ape-cancel').addEventListener('click', () => {
                this.aborted = true;
                window.__APE_GENERATION_ABORTED__ = true;
                this.log('⛔ CANCELANDO GENERACIÓN — procesando canales restantes se detendrá...', '#ff1744');
                document.getElementById('ape-cancel').textContent = '⏳ Cancelando...';
                document.getElementById('ape-cancel').disabled = true;
                setTimeout(() => this.close(), 2000);
            });

            this.log('🚀 HUD v16.0 Inicializado', '#00ff41');
            this.log(`📺 Procesando ${totalChannels} canales...`, '#03a9f4');
        },

        /**
         * Agrega mensaje al log
         */
        log(message, color = '#ccc') {
            if (!this.elements.log) return;
            const time = new Date().toLocaleTimeString('es-ES');
            const entry = document.createElement('div');
            entry.style.cssText = `color: ${color}; border-bottom: 1px dashed #111; padding: 3px 0;`;
            entry.innerHTML = `[${time}] ${message}`;
            this.elements.log.appendChild(entry);
            this.elements.log.scrollTop = this.elements.log.scrollHeight;
        },

        /**
         * Actualiza estadísticas del HUD
         */
        update(current, total, stats = {}) {
            if (this.elements.bar) {
                this.elements.bar.style.width = `${(current / total * 100).toFixed(2)}%`;
            }
            if (this.elements.counter) {
                this.elements.counter.textContent = `${current} / ${total}`;
            }

            // Estadísticas de perfiles
            if (stats.p0 !== undefined) this.elements.statP0.textContent = stats.p0;
            if (stats.p1 !== undefined) this.elements.statP1.textContent = stats.p1;
            if (stats.p2 !== undefined) this.elements.statP2.textContent = stats.p2;
            if (stats.p3 !== undefined) this.elements.statP3.textContent = stats.p3;
            if (stats.p4 !== undefined) this.elements.statP4.textContent = stats.p4;
            if (stats.p5 !== undefined) this.elements.statP5.textContent = stats.p5;

            // Estadísticas de rendimiento
            if (stats.headers !== undefined) this.elements.statHeaders.textContent = stats.headers;
            if (stats.jwt !== undefined) this.elements.statJwt.textContent = stats.jwt;
            if (stats.speed !== undefined) this.elements.statSpeed.textContent = stats.speed;

            // Actualizar tiempo
            if (this.startTime) {
                const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
                this.elements.statTime.textContent = `${elapsed}s`;
            }
        },

        /**
         * Muestra mensaje de completado
         */
        complete(stats = {}) {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
            this.log(`✅ GENERACIÓN COMPLETADA EN ${elapsed}s`, '#00ff41');
            this.log(`📊 Canales: ${stats.total || 0} | Headers: ${stats.headers || 0} | JWT: ${stats.jwt || '0 KB'}`, '#03a9f4');

            // Cambiar color del progreso a verde completo
            if (this.elements.bar) {
                this.elements.bar.style.background = '#00ff41';
                this.elements.bar.style.width = '100%';
            }

            // Cerrar después de 3 segundos
            setTimeout(() => this.close(), 3000);
        },

        /**
         * Cierra el HUD
         */
        close() {
            if (this.overlay) {
                this.overlay.style.animation = 'hudFadeIn 0.3s ease-out reverse';
                setTimeout(() => {
                    if (this.overlay) {
                        this.overlay.remove();
                        this.overlay = null;
                    }
                }, 300);
            }
        },

        /**
         * Verifica si fue abortado
         */
        isAborted() {
            return this.aborted;
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════

    window.HUD_V16 = HUD;
    window.APE_HUD = HUD; // Alias para compatibilidad

    console.log(`%c🖥️ HUD Overlay v${VERSION} Loaded`, 'color: #00ff41; font-weight: bold;');

})();
