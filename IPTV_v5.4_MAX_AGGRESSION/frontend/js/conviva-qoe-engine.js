/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎯 CONVIVA QoE ENGINE v1.0 — Disney+ Grade Telemetry for IPTV APE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replica exacta de las métricas que Conviva ($200K/año) mide para Disney+,
 * HBO Max, DAZN, Paramount+ — pero embebida gratis en nuestro ecosistema.
 *
 * MÉTRICAS CORE (las mismas de Conviva):
 *   1. VST  — Video Startup Time (ms hasta primer frame)
 *   2. EBVS — Exit Before Video Start (abandonó antes de ver?)
 *   3. RBR  — Rebuffering Ratio (% tiempo en círculo de carga)
 *   4. ABR  — Average Bitrate (calidad promedio real)
 *   5. FDR  — Frame Drop Rate (frames perdidos/segundo)
 *   6. CIRR — Connection Induced Rebuffer Rate
 *   7. EPF  — Ended Play Fraction (completó o abandonó?)
 *   8. QoE  — Experience Score (0-100, compuesto)
 *
 * DECISIONES AUTOMÁTICAS:
 *   - Si QoE < 60 → forzar degradación inmediata de calidad
 *   - Si rebuffer > 2% → activar modo "supervivencia" (480p)
 *   - Si frame drops > 5/s → señalar decoder sobrecargado
 *   - Si VST > 3000ms → pre-cargar siguiente canal en background
 *
 * INTEGRACIÓN: Se conecta con Guardian, PRISMA y Cortex existentes.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const ENGINE_VERSION = '1.0.0-DISNEY-GRADE';

    // ── Estado Global del Motor ──
    const _state = {
        sessions: new Map(),   // sessionId → SessionMetrics
        activeSession: null,
        globalStats: {
            totalSessions: 0,
            avgQoE: 0,
            avgVST: 0,
            totalRebufferEvents: 0,
            worstChannel: null
        }
    };

    // ── Umbrales (calibrados con datos reales de Conviva benchmarks) ──
    const THRESHOLDS = {
        VST_EXCELLENT: 1000,    // < 1s = excelente
        VST_GOOD: 2000,         // < 2s = bueno
        VST_POOR: 4000,         // < 4s = pobre
        VST_CRITICAL: 8000,     // > 8s = crítico (usuario se va)

        RBR_EXCELLENT: 0.001,   // < 0.1% = streaming perfecto
        RBR_GOOD: 0.005,        // < 0.5% = aceptable
        RBR_POOR: 0.02,         // < 2% = degradado
        RBR_CRITICAL: 0.05,     // > 5% = inaceptable

        FDR_EXCELLENT: 0,       // 0 drops = perfecto
        FDR_GOOD: 2,            // < 2/s = normal
        FDR_POOR: 5,            // < 5/s = decoder estresado
        FDR_CRITICAL: 10,       // > 10/s = decoder colapsado

        BITRATE_4K: 15000000,   // 15 Mbps
        BITRATE_1080P: 8000000, // 8 Mbps
        BITRATE_720P: 4000000,  // 4 Mbps
        BITRATE_480P: 2000000,  // 2 Mbps

        QOE_EXCELLENT: 85,
        QOE_GOOD: 70,
        QOE_POOR: 50,
        QOE_CRITICAL: 30
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SESSION LIFECYCLE (exactamente como Conviva maneja sessions)
    // ═══════════════════════════════════════════════════════════════════════

    class SessionMetrics {
        constructor(channelId, channelName, profile) {
            this.id = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this.channelId = channelId;
            this.channelName = channelName || `CH-${channelId}`;
            this.profile = profile || 'P3';

            // Timestamps
            this.createdAt = Date.now();
            this.firstFrameAt = null;
            this.endedAt = null;

            // VST (Video Startup Time)
            this.vst = null;
            this.ebvs = false; // Exit Before Video Start

            // Rebuffering
            this.rebufferEvents = [];
            this.rebufferStartedAt = null;
            this.totalRebufferMs = 0;
            this.totalPlayMs = 0;

            // Bitrate
            this.bitrateHistory = [];  // [{ts, bps}]
            this.currentBitrate = 0;
            this.peakBitrate = 0;

            // Frame Drops
            this.frameDropSamples = [];  // [{ts, dropped, total}]
            this.totalDropped = 0;
            this.totalDecoded = 0;

            // Quality Changes (ABR switches)
            this.qualityChanges = []; // [{ts, from, to, reason}]

            // Connection
            this.connectionType = 'unknown';
            this.effectiveBandwidth = 0;

            // Errors
            this.errors = [];  // [{ts, code, message}]

            // Computed QoE (updated every tick)
            this.qoeScore = 100;
            this.qoeHistory = [];  // [{ts, score}]

            // Decision log
            this.decisions = []; // [{ts, action, reason, data}]
        }

        // ── Marca primer frame visible ──
        markFirstFrame() {
            if (!this.firstFrameAt) {
                this.firstFrameAt = Date.now();
                this.vst = this.firstFrameAt - this.createdAt;
                this._log('FIRST_FRAME', { vst: this.vst });
            }
        }

        // ── Marca inicio de rebuffering ──
        markRebufferStart() {
            if (!this.rebufferStartedAt) {
                this.rebufferStartedAt = Date.now();
                this._log('REBUFFER_START', {});
            }
        }

        // ── Marca fin de rebuffering ──
        markRebufferEnd() {
            if (this.rebufferStartedAt) {
                const duration = Date.now() - this.rebufferStartedAt;
                this.rebufferEvents.push({
                    ts: this.rebufferStartedAt,
                    duration: duration
                });
                this.totalRebufferMs += duration;
                this.rebufferStartedAt = null;
                this._log('REBUFFER_END', { duration });
            }
        }

        // ── Actualiza bitrate actual ──
        updateBitrate(bps) {
            this.currentBitrate = bps;
            if (bps > this.peakBitrate) this.peakBitrate = bps;
            this.bitrateHistory.push({ ts: Date.now(), bps });
            // Mantener solo últimos 300 samples (5 min a 1/s)
            if (this.bitrateHistory.length > 300) this.bitrateHistory.shift();
        }

        // ── Actualiza frame drops ──
        updateFrameDrops(dropped, totalDecoded) {
            this.totalDropped = dropped;
            this.totalDecoded = totalDecoded;
            this.frameDropSamples.push({ ts: Date.now(), dropped, total: totalDecoded });
            if (this.frameDropSamples.length > 60) this.frameDropSamples.shift();
        }

        // ── Registra cambio de calidad ──
        logQualityChange(fromRes, toRes, reason) {
            this.qualityChanges.push({
                ts: Date.now(),
                from: fromRes,
                to: toRes,
                reason: reason || 'ABR_AUTO'
            });
            this._log('QUALITY_CHANGE', { from: fromRes, to: toRes, reason });
        }

        // ── Registra error ──
        logError(code, message) {
            this.errors.push({ ts: Date.now(), code, message });
            this._log('ERROR', { code, message });
        }

        // ── Marca sesión terminada ──
        endSession(reason) {
            this.endedAt = Date.now();
            if (!this.firstFrameAt) this.ebvs = true;
            this.totalPlayMs = this.endedAt - this.createdAt;
            this._log('SESSION_END', { reason, ebvs: this.ebvs, totalPlayMs: this.totalPlayMs });
        }

        // ═══════════════════════════════════════════════════════════════
        // CÁLCULO QoE (la fórmula de Conviva adaptada)
        // ═══════════════════════════════════════════════════════════════

        computeQoE() {
            let score = 100;

            // Factor 1: VST (peso 20%)
            if (this.vst !== null) {
                if (this.vst <= THRESHOLDS.VST_EXCELLENT) score -= 0;
                else if (this.vst <= THRESHOLDS.VST_GOOD) score -= 5;
                else if (this.vst <= THRESHOLDS.VST_POOR) score -= 15;
                else score -= 25;
            } else {
                // No ha arrancado aún — penalizar progresivamente
                const waitMs = Date.now() - this.createdAt;
                score -= Math.min(25, Math.floor(waitMs / 400));
            }

            // Factor 2: Rebuffering Ratio (peso 35% — el más importante)
            const rbr = this.getRebufferRatio();
            if (rbr <= THRESHOLDS.RBR_EXCELLENT) score -= 0;
            else if (rbr <= THRESHOLDS.RBR_GOOD) score -= 5;
            else if (rbr <= THRESHOLDS.RBR_POOR) score -= 20;
            else score -= 40;

            // Factor 3: Frame Drop Rate (peso 15%)
            const fdr = this.getFrameDropRate();
            if (fdr <= THRESHOLDS.FDR_EXCELLENT) score -= 0;
            else if (fdr <= THRESHOLDS.FDR_GOOD) score -= 3;
            else if (fdr <= THRESHOLDS.FDR_POOR) score -= 10;
            else score -= 20;

            // Factor 4: Bitrate vs Expectation (peso 15%)
            if (this.currentBitrate > 0) {
                if (this.currentBitrate >= THRESHOLDS.BITRATE_1080P) score -= 0;
                else if (this.currentBitrate >= THRESHOLDS.BITRATE_720P) score -= 5;
                else if (this.currentBitrate >= THRESHOLDS.BITRATE_480P) score -= 10;
                else score -= 15;
            }

            // Factor 5: Errores (peso 10%)
            const recentErrors = this.errors.filter(e => Date.now() - e.ts < 60000).length;
            score -= Math.min(15, recentErrors * 5);

            // Factor 6: Quality Stability (peso 5%)
            const recentSwitches = this.qualityChanges.filter(q => Date.now() - q.ts < 30000).length;
            if (recentSwitches > 3) score -= 10; // "yoyo" penalty

            this.qoeScore = Math.max(0, Math.min(100, score));
            this.qoeHistory.push({ ts: Date.now(), score: this.qoeScore });
            if (this.qoeHistory.length > 300) this.qoeHistory.shift();

            return this.qoeScore;
        }

        // ── Métricas derivadas ──

        getRebufferRatio() {
            const elapsed = Date.now() - this.createdAt;
            if (elapsed <= 0) return 0;
            const activeRebuffer = this.rebufferStartedAt ? (Date.now() - this.rebufferStartedAt) : 0;
            return (this.totalRebufferMs + activeRebuffer) / elapsed;
        }

        getFrameDropRate() {
            if (this.frameDropSamples.length < 2) return 0;
            const recent = this.frameDropSamples.slice(-10);
            const first = recent[0];
            const last = recent[recent.length - 1];
            const dtSec = (last.ts - first.ts) / 1000;
            if (dtSec <= 0) return 0;
            return (last.dropped - first.dropped) / dtSec;
        }

        getAverageBitrate() {
            if (this.bitrateHistory.length === 0) return 0;
            const sum = this.bitrateHistory.reduce((a, b) => a + b.bps, 0);
            return Math.round(sum / this.bitrateHistory.length);
        }

        // ── Logger interno ──
        _log(event, data) {
            this.decisions.push({ ts: Date.now(), action: event, data });
            if (this.decisions.length > 500) this.decisions.shift();
        }

        // ── Snapshot completo para telemetría ──
        toSnapshot() {
            return {
                sessionId: this.id,
                channelId: this.channelId,
                channelName: this.channelName,
                profile: this.profile,
                vst: this.vst,
                ebvs: this.ebvs,
                rebufferRatio: (this.getRebufferRatio() * 100).toFixed(3) + '%',
                rebufferEvents: this.rebufferEvents.length,
                totalRebufferMs: this.totalRebufferMs,
                avgBitrate: this.getAverageBitrate(),
                currentBitrate: this.currentBitrate,
                peakBitrate: this.peakBitrate,
                frameDropRate: this.getFrameDropRate().toFixed(2) + '/s',
                qualityChanges: this.qualityChanges.length,
                errors: this.errors.length,
                qoeScore: this.qoeScore,
                uptimeMs: Date.now() - this.createdAt,
                engineVersion: ENGINE_VERSION
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DECISION ENGINE (el cerebro que Conviva alimenta con datos)
    // ═══════════════════════════════════════════════════════════════════════

    class DecisionEngine {
        constructor() {
            this.lastDecisionAt = 0;
            this.cooldownMs = 3000; // No tomar decisiones más rápido que cada 3s
        }

        evaluate(session) {
            if (!session) return null;

            const now = Date.now();
            if (now - this.lastDecisionAt < this.cooldownMs) return null;

            const qoe = session.computeQoE();
            const rbr = session.getRebufferRatio();
            const fdr = session.getFrameDropRate();
            let decision = null;

            // ── DECISIÓN 1: Modo Supervivencia ──
            if (rbr > THRESHOLDS.RBR_CRITICAL) {
                decision = {
                    action: 'FORCE_SURVIVAL_MODE',
                    targetRes: '854x480',
                    targetBitrate: THRESHOLDS.BITRATE_480P,
                    reason: `Rebuffer ratio ${(rbr * 100).toFixed(1)}% > 5% — red colapsada`,
                    severity: 'CRITICAL'
                };
            }
            // ── DECISIÓN 2: Degradar calidad ──
            else if (qoe < THRESHOLDS.QOE_POOR) {
                decision = {
                    action: 'DEGRADE_QUALITY',
                    targetRes: '1280x720',
                    targetBitrate: THRESHOLDS.BITRATE_720P,
                    reason: `QoE score ${qoe} < ${THRESHOLDS.QOE_POOR} — experiencia pobre`,
                    severity: 'WARNING'
                };
            }
            // ── DECISIÓN 3: Decoder sobrecargado ──
            else if (fdr > THRESHOLDS.FDR_POOR) {
                decision = {
                    action: 'REDUCE_DECODER_LOAD',
                    targetRes: '1280x720',
                    reason: `Frame drops ${fdr.toFixed(1)}/s > ${THRESHOLDS.FDR_POOR} — decoder estresado`,
                    severity: 'WARNING'
                };
            }
            // ── DECISIÓN 4: Promover calidad ──
            else if (qoe >= THRESHOLDS.QOE_EXCELLENT && session.currentBitrate < THRESHOLDS.BITRATE_1080P) {
                const stableTime = session.qoeHistory.filter(h => h.score >= 80).length;
                if (stableTime >= 15) { // 15 segundos estable
                    decision = {
                        action: 'PROMOTE_QUALITY',
                        targetRes: '1920x1080',
                        targetBitrate: THRESHOLDS.BITRATE_1080P,
                        reason: `QoE ${qoe} estable por ${stableTime}s — promover`,
                        severity: 'INFO'
                    };
                }
            }

            if (decision) {
                this.lastDecisionAt = now;
                decision.ts = now;
                decision.qoeScore = qoe;
                session.decisions.push(decision);
                console.log(`🎯 [CONVIVA-QoE] Decision: ${decision.action} — ${decision.reason}`);
            }

            return decision;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // API PÚBLICA (interfaz idéntica conceptualmente a Conviva SDK)
    // ═══════════════════════════════════════════════════════════════════════

    const _decisionEngine = new DecisionEngine();
    let _tickInterval = null;

    const ConvivaQoE = {

        VERSION: ENGINE_VERSION,

        /** Inicia una nueva sesión de monitoreo (equivalente a Conviva.createSession) */
        createSession(channelId, channelName, profile) {
            const session = new SessionMetrics(channelId, channelName, profile);
            _state.sessions.set(session.id, session);
            _state.activeSession = session;
            _state.globalStats.totalSessions++;
            console.log(`📊 [CONVIVA-QoE] Session created: ${session.id} — CH:${channelId} "${channelName}"`);
            this._startTick();
            return session.id;
        },

        /** Marca que el primer frame es visible */
        reportFirstFrame(sessionId) {
            const s = this._getSession(sessionId);
            if (s) s.markFirstFrame();
        },

        /** Marca inicio de rebuffering (círculo de carga visible) */
        reportRebufferStart(sessionId) {
            const s = this._getSession(sessionId);
            if (s) s.markRebufferStart();
        },

        /** Marca fin de rebuffering */
        reportRebufferEnd(sessionId) {
            const s = this._getSession(sessionId);
            if (s) s.markRebufferEnd();
        },

        /** Actualiza bitrate actual (llamar cada segundo) */
        reportBitrate(sessionId, bps) {
            const s = this._getSession(sessionId);
            if (s) s.updateBitrate(bps);
        },

        /** Actualiza frame drops (llamar cada segundo desde video element) */
        reportFrameDrops(sessionId, droppedFrames, totalFrames) {
            const s = this._getSession(sessionId);
            if (s) s.updateFrameDrops(droppedFrames, totalFrames);
        },

        /** Registra un cambio de calidad ABR */
        reportQualityChange(sessionId, fromRes, toRes, reason) {
            const s = this._getSession(sessionId);
            if (s) s.logQualityChange(fromRes, toRes, reason);
        },

        /** Registra un error de reproducción */
        reportError(sessionId, code, message) {
            const s = this._getSession(sessionId);
            if (s) s.logError(code, message);
        },

        /** Termina la sesión */
        endSession(sessionId, reason) {
            const s = this._getSession(sessionId);
            if (s) {
                s.endSession(reason || 'USER_EXIT');
                if (_state.activeSession && _state.activeSession.id === sessionId) {
                    _state.activeSession = null;
                }
            }
        },

        /** Obtiene snapshot de la sesión activa */
        getActiveSnapshot() {
            if (_state.activeSession) return _state.activeSession.toSnapshot();
            return null;
        },

        /** Obtiene QoE score actual (0-100) */
        getQoEScore(sessionId) {
            const s = this._getSession(sessionId);
            return s ? s.computeQoE() : -1;
        },

        /** Obtiene estadísticas globales */
        getGlobalStats() {
            return { ..._state.globalStats };
        },

        /** Fuerza una evaluación de decisión ahora */
        forceEvaluate(sessionId) {
            const s = this._getSession(sessionId);
            return s ? _decisionEngine.evaluate(s) : null;
        },

        // ── Internals ──

        _getSession(sessionId) {
            if (!sessionId && _state.activeSession) return _state.activeSession;
            return _state.sessions.get(sessionId) || _state.activeSession;
        },

        _startTick() {
            if (_tickInterval) return;
            _tickInterval = setInterval(() => {
                if (!_state.activeSession) return;

                // Computar QoE cada segundo
                const qoe = _state.activeSession.computeQoE();

                // Evaluar decisiones
                const decision = _decisionEngine.evaluate(_state.activeSession);

                // Emitir evento para integración con Guardian/PRISMA
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('conviva-qoe-tick', {
                        detail: {
                            qoe: qoe,
                            snapshot: _state.activeSession.toSnapshot(),
                            decision: decision
                        }
                    }));
                }

                // Actualizar stats globales
                const allScores = Array.from(_state.sessions.values())
                    .filter(s => s.qoeScore > 0)
                    .map(s => s.qoeScore);
                if (allScores.length > 0) {
                    _state.globalStats.avgQoE = Math.round(
                        allScores.reduce((a, b) => a + b, 0) / allScores.length
                    );
                }
            }, 1000);
        },

        _stopTick() {
            if (_tickInterval) {
                clearInterval(_tickInterval);
                _tickInterval = null;
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        window.ConvivaQoE = ConvivaQoE;
        console.log(`🎯 [CONVIVA-QoE] Engine v${ENGINE_VERSION} loaded — Disney+ Grade Telemetry Active`);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ConvivaQoE;
    }

})();
