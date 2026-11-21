/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 HUD TYPED ARRAYS v16.0.0 - Visual Progress System for TYPED ARRAYS Generator
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * HUD dedicado para el generador M3U8 TYPED ARRAYS ULTIMATE.
 * Muestra en tiempo real:
 * - Canales procesados
 * - Distribución por perfil (P0-P5)
 * - Líneas EXTVLCOPT, KODIPROP, EXT-X-APE
 * - JWT size y velocidad
 * - Log de eventos en tiempo real
 * 
 * @version 16.0.0
 * @date 2026-01-30
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '16.0.0';

    // ═══════════════════════════════════════════════════════════════════════════
    // HUD TYPED ARRAYS SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    const HUD_TYPED_ARRAYS = {
        overlay: null,
        elements: {},
        startTime: null,
        aborted: false,
        totalChannels: 0,
        currentChannel: 0,
        stats: {
            p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0,
            extvlcopt: 0,
            kodiprop: 0,
            extxape: 0,
            jwt: 0,
            linesTotal: 0
        },

        /**
         * Inicializa el HUD
         * @param {number} totalChannels - Total de canales a procesar
         * @param {object} config - Configuración adicional
         */
        init(totalChannels, config = {}) {
            this.startTime = Date.now();
            this.aborted = false;
            window.__APE_GENERATION_ABORTED__ = false;
            this.totalChannels = totalChannels;
            this.currentChannel = 0;
            this.stats = { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, extvlcopt: 0, kodiprop: 0, extxape: 0, jwt: 0, linesTotal: 0 };

            // Remover HUD anterior si existe
            const existing = document.getElementById('typed-arrays-hud');
            if (existing) existing.remove();

            // Session ID
            const sessionId = config.sessionId || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2)}`;

            // Crear HUD
            const hud = document.createElement('div');
            hud.id = 'typed-arrays-hud';
            hud.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: linear-gradient(135deg, rgba(10, 5, 25, 0.98), rgba(25, 10, 40, 0.98));
                z-index: 999999;
                display: flex; flex-direction: column;
                padding: 30px 40px;
                font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
                color: #e879f9;
                box-sizing: border-box;
                border: 3px solid transparent;
                border-image: linear-gradient(90deg, #8b5cf6, #e879f9, #06b6d4) 1;
                animation: typedHudFadeIn 0.4s ease-out;
            `;

            hud.innerHTML = `
                <style>
                    @keyframes typedHudFadeIn {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
                    @keyframes glow { 0%, 100% { box-shadow: 0 0 10px #8b5cf6; } 50% { box-shadow: 0 0 25px #e879f9; } }
                    @keyframes slideIn { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                    .typed-stat-box { transition: all 0.2s ease; }
                    .typed-stat-box:hover { transform: scale(1.05); border-color: #e879f9 !important; }
                    #typed-arrays-hud button:hover { background: rgba(139, 92, 246, 0.3) !important; }
                    .log-entry { animation: slideIn 0.2s ease-out; }
                </style>
                
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(139, 92, 246, 0.4); padding-bottom: 15px; margin-bottom: 15px;">
                    <div>
                        <h1 style="margin: 0; font-size: 26px; background: linear-gradient(90deg, #8b5cf6, #e879f9, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 1px;">
                            🚀 TYPED ARRAYS ULTIMATE v16.0.0
                        </h1>
                        <div style="color: #a78bfa; font-size: 12px; margin-top: 5px;">
                            133 LÍNEAS/CANAL | SESSION: <span style="color: #06b6d4;">${sessionId.slice(0, 8)}</span>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 38px; font-weight: bold; color: #06b6d4;" id="ta-counter">
                            <span style="color: #e879f9;">0</span> / ${totalChannels}
                        </div>
                        <div style="color: #6b7280; font-size: 11px; text-transform: uppercase;">CANALES PROCESADOS</div>
                    </div>
                </div>

                <!-- PROFILE DISTRIBUTION -->
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px;">
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #581c87; border-radius: 8px; text-align: center;">
                        <div style="color: #9333ea; font-size: 10px; text-transform: uppercase;">P0 8K IMAX</div>
                        <div style="font-size: 22px; font-weight: bold; color: #c084fc;" id="ta-p0">0</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #7c3aed; border-radius: 8px; text-align: center;">
                        <div style="color: #a78bfa; font-size: 10px; text-transform: uppercase;">P1 4K 60FPS</div>
                        <div style="font-size: 22px; font-weight: bold; color: #a78bfa;" id="ta-p1">0</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #ec4899; border-radius: 8px; text-align: center;">
                        <div style="color: #f472b6; font-size: 10px; text-transform: uppercase;">P2 4K</div>
                        <div style="font-size: 22px; font-weight: bold; color: #f472b6;" id="ta-p2">0</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #f59e0b; border-radius: 8px; text-align: center;">
                        <div style="color: #fbbf24; font-size: 10px; text-transform: uppercase;">P3 FHD</div>
                        <div style="font-size: 22px; font-weight: bold; color: #fbbf24;" id="ta-p3">0</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #22c55e; border-radius: 8px; text-align: center;">
                        <div style="color: #4ade80; font-size: 10px; text-transform: uppercase;">P4 HD</div>
                        <div style="font-size: 22px; font-weight: bold; color: #4ade80;" id="ta-p4">0</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #64748b; border-radius: 8px; text-align: center;">
                        <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">P5 SD</div>
                        <div style="font-size: 22px; font-weight: bold; color: #94a3b8;" id="ta-p5">0</div>
                    </div>
                </div>

                <!-- LINES BREAKDOWN -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;">
                    <div class="typed-stat-box" style="background: rgba(139, 92, 246, 0.1); padding: 8px 12px; border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #a78bfa; font-size: 11px;">📺 EXTVLCOPT</span>
                            <span style="font-size: 18px; font-weight: bold; color: #c084fc;" id="ta-extvlcopt">0</span>
                        </div>
                        <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">63 líneas/canal</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(236, 72, 153, 0.1); padding: 8px 12px; border: 1px solid rgba(236, 72, 153, 0.4); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #f472b6; font-size: 11px;">🎬 KODIPROP</span>
                            <span style="font-size: 18px; font-weight: bold; color: #f472b6;" id="ta-kodiprop">0</span>
                        </div>
                        <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">38 líneas/canal</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(6, 182, 212, 0.1); padding: 8px 12px; border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #22d3ee; font-size: 11px;">⚡ EXT-X-APE</span>
                            <span style="font-size: 18px; font-weight: bold; color: #22d3ee;" id="ta-extxape">0</span>
                        </div>
                        <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">29 líneas/canal</div>
                    </div>
                    <div class="typed-stat-box" style="background: rgba(34, 197, 94, 0.1); padding: 8px 12px; border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #4ade80; font-size: 11px;">📄 TOTAL LINES</span>
                            <span style="font-size: 18px; font-weight: bold; color: #4ade80;" id="ta-lines">0</span>
                        </div>
                        <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">~133 líneas/canal</div>
                    </div>
                </div>

                <!-- LOG AREA -->
                <div id="ta-log" style="
                    flex: 1;
                    background: rgba(0, 0, 0, 0.6);
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    border-radius: 8px;
                    padding: 12px 15px;
                    overflow-y: auto;
                    font-size: 11px;
                    line-height: 1.7;
                    margin-bottom: 12px;
                    color: #d1d5db;
                "></div>

                <!-- METRICS BAR -->
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px;">
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #374151;">
                        <div style="color: #6b7280; font-size: 10px; text-transform: uppercase;">GROUP-TITLE</div>
                        <div style="font-size: 14px; color: #a78bfa; font-weight: bold;" id="ta-grouptitle">✓</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #374151;">
                        <div style="color: #6b7280; font-size: 10px; text-transform: uppercase;">JWT SIZE</div>
                        <div style="font-size: 14px; color: #06b6d4; font-weight: bold;" id="ta-jwt">0 KB</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #374151;">
                        <div style="color: #6b7280; font-size: 10px; text-transform: uppercase;">VELOCIDAD</div>
                        <div style="font-size: 14px; color: #22c55e; font-weight: bold;" id="ta-speed">0 ch/s</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #374151;">
                        <div style="color: #6b7280; font-size: 10px; text-transform: uppercase;">FILE SIZE</div>
                        <div style="font-size: 14px; color: #f472b6; font-weight: bold;" id="ta-filesize">0 MB</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #374151;">
                        <div style="color: #6b7280; font-size: 10px; text-transform: uppercase;">TIEMPO</div>
                        <div style="font-size: 14px; color: #fbbf24; font-weight: bold;" id="ta-time">0.0s</div>
                    </div>
                </div>

                <!-- PROGRESS BAR -->
                <div style="height: 24px; background: rgba(0,0,0,0.5); border-radius: 12px; overflow: hidden; border: 1px solid rgba(139, 92, 246, 0.4); position: relative;">
                    <div id="ta-progress" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, #8b5cf6, #e879f9, #06b6d4);
                        transition: width 0.15s ease-out;
                        position: relative;
                    "></div>
                    <div id="ta-progress-text" style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        font-size: 11px;
                        font-weight: bold;
                        color: white;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    ">0%</div>
                </div>

                <!-- CANCEL BUTTON -->
                <button id="ta-cancel" style="
                    margin-top: 15px;
                    background: transparent;
                    border: 2px solid #ef4444;
                    color: #ef4444;
                    padding: 12px 20px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 13px;
                    border-radius: 8px;
                    font-weight: bold;
                    transition: all 0.2s;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                ">
                    ⛔ CANCELAR GENERACIÓN
                </button>
            `;

            document.body.appendChild(hud);

            // ────────────────────────────────────────────────────────────────
            // FLOATING CONTROLS — always visible, never scrolled off screen
            // ────────────────────────────────────────────────────────────────
            const floatingCtrl = document.createElement('div');
            floatingCtrl.id = 'ta-floating-controls';
            floatingCtrl.style.cssText = `
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 2147483647;
                display: flex;
                gap: 8px;
                font-family: 'Courier New', monospace;
            `;
            floatingCtrl.innerHTML = `
                <button id="ta-float-minimize" title="Minimizar HUD" style="
                    background: #0f172a; border: 2px solid #38bdf8; color: #38bdf8;
                    padding: 8px 14px; font-size: 16px; font-weight: bold;
                    cursor: pointer; border-radius: 6px; line-height: 1;
                ">—</button>
                <button id="ta-float-cancel" title="CANCELAR GENERACIÓN" style="
                    background: #7f1d1d; border: 2px solid #ef4444; color: #fecaca;
                    padding: 8px 14px; font-size: 13px; font-weight: bold;
                    cursor: pointer; border-radius: 6px; text-transform: uppercase;
                    letter-spacing: 1px; box-shadow: 0 4px 12px rgba(239,68,68,0.4);
                ">⛔ CANCELAR</button>
            `;
            document.body.appendChild(floatingCtrl);

            // Floating cancel handler (same as internal button)
            document.getElementById('ta-float-cancel').addEventListener('click', () => {
                this.aborted = true;
                window.__APE_GENERATION_ABORTED__ = true;
                this.log('⛔ CANCELANDO GENERACIÓN (from floating)...', '#ef4444');
                document.getElementById('ta-float-cancel').textContent = '⏳ Cancelando...';
                document.getElementById('ta-float-cancel').disabled = true;
                setTimeout(() => this.close(), 2000);
            });

            // Minimize: hide main HUD, keep floating controls so user can re-open or cancel
            document.getElementById('ta-float-minimize').addEventListener('click', () => {
                const isMin = hud.dataset.minimized === '1';
                if (isMin) {
                    hud.style.display = 'flex';
                    hud.dataset.minimized = '0';
                    document.getElementById('ta-float-minimize').textContent = '—';
                    document.getElementById('ta-float-minimize').title = 'Minimizar HUD';
                } else {
                    hud.style.display = 'none';
                    hud.dataset.minimized = '1';
                    document.getElementById('ta-float-minimize').textContent = '▢';
                    document.getElementById('ta-float-minimize').title = 'Restaurar HUD';
                }
            });

            this.overlay = hud;
            this.floatingCtrl = floatingCtrl;
            this.elements = {
                log: document.getElementById('ta-log'),
                bar: document.getElementById('ta-progress'),
                barText: document.getElementById('ta-progress-text'),
                counter: document.getElementById('ta-counter'),
                p0: document.getElementById('ta-p0'),
                p1: document.getElementById('ta-p1'),
                p2: document.getElementById('ta-p2'),
                p3: document.getElementById('ta-p3'),
                p4: document.getElementById('ta-p4'),
                p5: document.getElementById('ta-p5'),
                extvlcopt: document.getElementById('ta-extvlcopt'),
                kodiprop: document.getElementById('ta-kodiprop'),
                extxape: document.getElementById('ta-extxape'),
                lines: document.getElementById('ta-lines'),
                grouptitle: document.getElementById('ta-grouptitle'),
                jwt: document.getElementById('ta-jwt'),
                speed: document.getElementById('ta-speed'),
                filesize: document.getElementById('ta-filesize'),
                time: document.getElementById('ta-time')
            };

            // Cancel button handler — detiene generación real via flag global
            document.getElementById('ta-cancel').addEventListener('click', () => {
                this.aborted = true;
                window.__APE_GENERATION_ABORTED__ = true;
                this.log('⛔ CANCELANDO GENERACIÓN — deteniendo procesamiento...', '#ef4444');
                document.getElementById('ta-cancel').textContent = '⏳ Cancelando...';
                document.getElementById('ta-cancel').disabled = true;
                setTimeout(() => this.close(), 2000);
            });

            this.log('🚀 TYPED ARRAYS HUD v16.0 Inicializado', '#8b5cf6');
            this.log(`📺 Procesando ${totalChannels.toLocaleString()} canales...`, '#06b6d4');
            this.log(`🎯 Estructura: 63 EXTVLCOPT + 38 KODIPROP + 29 EXT-X-APE = 133 líneas/canal`, '#a78bfa');
        },

        /**
         * Agrega mensaje al log
         */
        log(message, color = '#d1d5db') {
            if (!this.elements.log) return;
            const time = new Date().toLocaleTimeString('es-ES');
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.style.cssText = `color: ${color}; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 3px 0;`;
            entry.innerHTML = `<span style="color: #6b7280;">[${time}]</span> ${message}`;
            this.elements.log.appendChild(entry);
            this.elements.log.scrollTop = this.elements.log.scrollHeight;
        },

        /**
         * Incrementa el contador de un perfil (1 por canal emitido).
         * Se llama SIN throttle — O(1), safe para loop 4,536× por generación.
         * Toca solo el DOM de esa tarjeta de perfil, no la barra ni contadores pesados.
         */
        tickProfile(profile) {
            const profileLower = String(profile || 'p3').toLowerCase();
            if (this.stats[profileLower] !== undefined) {
                this.stats[profileLower]++;
                const el = this.elements[profileLower];
                if (el) el.textContent = this.stats[profileLower].toLocaleString();
            }
        },

        /**
         * Actualiza canal actual (DOM pesado: barra + counter + líneas + speed).
         * Se llama THROTTLED cada 50 canales desde el generador.
         * NOTA: ya NO gestiona el contador de perfil — eso lo hace tickProfile() sin throttle.
         */
        updateChannel(current, channelName = '', profile = 'P3') {
            this.currentChannel = current;
            const pct = ((current / this.totalChannels) * 100).toFixed(1);

            // Progress
            if (this.elements.bar) this.elements.bar.style.width = `${pct}%`;
            if (this.elements.barText) this.elements.barText.textContent = `${pct}%`;

            // Counter
            if (this.elements.counter) {
                this.elements.counter.innerHTML = `<span style="color: #e879f9;">${current.toLocaleString()}</span> / ${this.totalChannels.toLocaleString()}`;
            }

            // Lines
            this.stats.extvlcopt = current * 63;
            this.stats.kodiprop = current * 38;
            this.stats.extxape = current * 29;
            this.stats.linesTotal = current * 133;

            if (this.elements.extvlcopt) this.elements.extvlcopt.textContent = this.stats.extvlcopt.toLocaleString();
            if (this.elements.kodiprop) this.elements.kodiprop.textContent = this.stats.kodiprop.toLocaleString();
            if (this.elements.extxape) this.elements.extxape.textContent = this.stats.extxape.toLocaleString();
            if (this.elements.lines) this.elements.lines.textContent = this.stats.linesTotal.toLocaleString();

            // Speed & Time
            const elapsed = (Date.now() - this.startTime) / 1000;
            const speed = elapsed > 0 ? (current / elapsed).toFixed(0) : 0;
            if (this.elements.speed) this.elements.speed.textContent = `${speed} ch/s`;
            if (this.elements.time) this.elements.time.textContent = `${elapsed.toFixed(1)}s`;
        },

        /**
         * Actualiza estadísticas adicionales
         */
        updateStats(stats = {}) {
            if (stats.jwt && this.elements.jwt) this.elements.jwt.textContent = stats.jwt;
            if (stats.filesize && this.elements.filesize) this.elements.filesize.textContent = stats.filesize;
            if (stats.grouptitle && this.elements.grouptitle) this.elements.grouptitle.textContent = stats.grouptitle;
        },

        /**
         * Muestra mensaje de completado
         */
        complete(finalStats = {}) {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

            this.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, '#8b5cf6');
            this.log(`✅ GENERACIÓN COMPLETADA EN ${elapsed}s`, '#22c55e');
            this.log(`📊 ${this.totalChannels.toLocaleString()} canales | ${this.stats.linesTotal.toLocaleString()} líneas totales`, '#06b6d4');
            this.log(`📦 JWT: ${finalStats.jwt || 'N/A'} | File: ${finalStats.filesize || 'N/A'}`, '#a78bfa');
            this.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, '#8b5cf6');

            // Cambiar barra a verde
            if (this.elements.bar) {
                this.elements.bar.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
                this.elements.bar.style.width = '100%';
            }
            if (this.elements.barText) {
                this.elements.barText.textContent = '✓ COMPLETADO';
            }

            // Cerrar después de 3s
            setTimeout(() => this.close(), 3000);
        },

        /**
         * Cierra el HUD
         */
        close() {
            if (this.overlay) {
                this.overlay.style.animation = 'typedHudFadeIn 0.3s ease-out reverse';
                setTimeout(() => {
                    if (this.overlay) {
                        this.overlay.remove();
                        this.overlay = null;
                    }
                    if (this.floatingCtrl) {
                        this.floatingCtrl.remove();
                        this.floatingCtrl = null;
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

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    window.HUD_TYPED_ARRAYS = HUD_TYPED_ARRAYS;

    console.log(`%c🚀 HUD TYPED ARRAYS v${VERSION} Loaded`, 'color: #e879f9; font-weight: bold; background: #1a0a2e; padding: 4px 8px; border-radius: 4px;');

})();
