/**
 * Generation HUD Overlay v1.1 — UI feedback discreta durante el flow del botón
 * 🩺 GENERAR + PREPUBLISH + AUDITAR.
 *
 * Doctrina: ESTRICTAMENTE OBSERVADOR + DISCRETO.
 *   - NO toca el flow de generación (no modifica controller, no intercepta requests).
 *   - Panel COMPACTO en esquina superior-derecha (~320×140px), no obstruye el HUD
 *     del generator real ni la tabla de canales.
 *   - Acompaña TODO el pipeline desde click hasta éxito/error (no se cierra al
 *     arrancar TYPED-ARRAYS).
 *   - Solo se cierra al detectar éxito final, error, o click manual del usuario.
 *
 * Fases observadas (mapeadas desde console.log del controller):
 *   INIT → PREPUBLISH → DYNAMIC-PROBE → POST-PROBE → STREAMING → META-SCAN
 *        → META-CLUSTER → GENERATING → UPLOADING → DONE / ERROR
 *
 * Uso:
 *   window.GenerationHUD.show()  — abrir
 *   window.GenerationHUD.hide()  — cerrar manualmente
 */
(function () {
    'use strict';

    let hudEl = null;
    let _origLog = null, _origError = null, _origWarn = null;
    let _origToast = null;
    let _startTime = 0;
    let _phase = 'INIT';
    let _channelsTotal = 0;
    let _channelsProcessed = 0;
    let _currentMessage = 'Inicializando pipeline...';
    let _timerInterval = null;
    let _autoCloseTimer = null;
    let _inactivityInterval = null;
    let _lastUpdateTime = 0;
    // Si pasan estos ms sin que ningún log matchee, asumimos pipeline terminado
    // (en GENERATING o UPLOADING significa que ya bajó el archivo o el VPS aceptó).
    const INACTIVITY_TIMEOUT_MS = 45000;

    // Patrones de logs que mapean a fases del pipeline.
    const PHASE_PATTERNS = [
        { regex: /\[APE-PREPUBLISH\]\s*Cobertura\s+admitted\s*:\s*(\d+)\s*\/\s*(\d+)/i,
          phase: 'PREPUBLISH', desc: 'Calculando cobertura' },
        { regex: /\[APE-PREPUBLISH\]\s*Cobertura\s*<\s*\d+%\s*→/i,
          phase: 'DYNAMIC-PROBE', desc: 'Activando Dynamic Probing' },
        { regex: /\[APE-PREPUBLISH\]\s*Post-probe\s+cobertura\s*:\s*(\d+)\s*\/\s*(\d+)/i,
          phase: 'POST-PROBE', desc: 'Cobertura post-probe' },
        { regex: /\[APE-PREPUBLISH\]\s*Usando\s+generateAndDownloadStreaming/i,
          phase: 'STREAMING', desc: 'Iniciando zero-copy' },
        { regex: /\[APE-META\]\s*Auto-escaneando\s+metadata/i,
          phase: 'META-SCAN', desc: 'Escaneo metadata delta' },
        { regex: /\[APE-META\]\s*Iniciando\s+escaneo\s+de\s+(\d+)\s+canales/i,
          phase: 'META-CLUSTER', desc: 'Escaneo meta-cluster' },
        { regex: /\[TYPED-ARRAYS\]|TYPED ARRAYS ULTIMATE.*Loaded|HUD TYPED ARRAYS|TA-\d+/i,
          phase: 'GENERATING', desc: 'Construyendo M3U8' },
        { regex: /\[STREAM\]|generateChannelEntry/i,
          phase: 'GENERATING', desc: 'Procesando canales' },
        { regex: /\[VPS-API\]|\[GZIP\]|Subiendo Chunks|TURBO.*UPLOAD/i,
          phase: 'UPLOADING', desc: 'Subiendo al VPS' },
        // Patrones DONE — múltiples para capturar todos los puntos de éxito del pipeline.
        // El controller dispara showToast/alert al terminar, además de varios console.log.
        { regex: /✅.*Lista descargada|✅.*PRO-VERIFIED|Subida completada con éxito|Lista descargada:.*canales|🔗\s*URL:|public_url|generateAndDownloadStreaming.*returned|💾.*saved|Download started|Generación completada|TOTAL LINES/i,
          phase: 'DONE', desc: 'Generación completa' },
        { regex: /\[APE-PREPUBLISH\].*Generaci[oó]n abortada|Cancelled|Generation FAILED|❌.*Error|Upload did not complete|Generación cancelada/i,
          phase: 'ERROR', desc: 'Pipeline abortado' }
    ];

    const PHASE_PROGRESS = {
        'INIT': 3, 'PREPUBLISH': 10, 'DYNAMIC-PROBE': 20,
        'POST-PROBE': 32, 'STREAMING': 42, 'META-SCAN': 52,
        'META-CLUSTER': 62, 'GENERATING': 78, 'UPLOADING': 92,
        'DONE': 100, 'ERROR': 100
    };

    function _createHUD() {
        const el = document.createElement('div');
        el.id = 'ape-gen-hud-overlay';
        // Compacto, esquina superior-derecha, glassmorphism oscuro para coherencia con la UI app.
        el.style.cssText = [
            'position:fixed', 'top:80px', 'right:20px',
            'width:320px', 'z-index:99999',
            'background:linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.96))',
            'backdrop-filter:blur(12px)', '-webkit-backdrop-filter:blur(12px)',
            'border-radius:14px',
            'box-shadow:0 12px 40px rgba(14,165,233,0.25),0 0 0 1px rgba(14,165,233,0.3)',
            'font-family:"Segoe UI",system-ui,sans-serif',
            'padding:14px',
            'color:#e2e8f0',
            'transition:opacity 0.3s, transform 0.3s'
        ].join(';');

        el.innerHTML = `
            <!-- Header compacto -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">🩺</span>
                    <span style="font-size:12px; font-weight:700; color:#7dd3fc; letter-spacing:0.04em;">GENERANDO LISTA</span>
                </div>
                <button id="ape-gen-hud-close" type="button" title="Ocultar (la generación sigue en background)"
                    style="background:rgba(148,163,184,0.15); border:none; width:22px; height:22px; border-radius:11px; cursor:pointer; color:#94a3b8; font-size:11px; line-height:1; padding:0;">✕</button>
            </div>

            <!-- Fase actual -->
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.06em;">Fase</div>
            <div id="ape-gen-hud-phase" style="font-size:13px; font-weight:600; color:#38bdf8; margin-bottom:10px; line-height:1.2; min-height:32px;">
                INIT — preparando
            </div>

            <!-- Progress bar compacta -->
            <div style="position:relative; height:18px; background:rgba(15,23,42,0.6); border-radius:6px; overflow:hidden; margin-bottom:8px; border:1px solid rgba(56,189,248,0.15);">
                <div id="ape-gen-hud-bar" style="width:0%; height:100%; background:linear-gradient(90deg,#0ea5e9,#2563eb); border-radius:6px; transition:width 0.4s ease-out;"></div>
                <div id="ape-gen-hud-pct" style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:10px; color:#f1f5f9; text-shadow:0 1px 2px rgba(0,0,0,0.5);">0%</div>
            </div>

            <!-- Stats compactas: Canales · Tiempo -->
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#94a3b8;">
                <div>
                    <span style="color:#64748b;">📺</span>
                    <span id="ape-gen-hud-channels" style="color:#e2e8f0; font-weight:600; margin-left:3px;">—</span>
                </div>
                <div>
                    <span style="color:#64748b;">⏱</span>
                    <span id="ape-gen-hud-time" style="color:#e2e8f0; font-weight:600; margin-left:3px;">0.0s</span>
                </div>
                <div>
                    <span id="ape-gen-hud-badge" style="background:rgba(14,165,233,0.15); color:#38bdf8; font-size:9px; padding:2px 7px; border-radius:8px; font-weight:700; letter-spacing:0.04em; border:1px solid rgba(14,165,233,0.3);">PROC</span>
                </div>
            </div>
        `;

        el.querySelector('#ape-gen-hud-close').addEventListener('click', hide);
        return el;
    }

    function _installLogProxy() {
        if (_origLog) return;
        _origLog = console.log;
        _origError = console.error;
        _origWarn = console.warn;
        const wrap = (orig) => function () {
            try {
                const msg = Array.prototype.map.call(arguments, a =>
                    (typeof a === 'string' ? a : '')).join(' ');
                if (msg) _handleLog(msg);
            } catch (_) {}
            return orig.apply(console, arguments);
        };
        console.log = wrap(_origLog);
        console.error = wrap(_origError);
        console.warn = wrap(_origWarn);
    }

    function _uninstallLogProxy() {
        if (_origLog) { console.log = _origLog; _origLog = null; }
        if (_origError) { console.error = _origError; _origError = null; }
        if (_origWarn) { console.warn = _origWarn; _origWarn = null; }
    }

    function _handleLog(msg) {
        if (!hudEl) return;
        for (const p of PHASE_PATTERNS) {
            const m = msg.match(p.regex);
            if (m) {
                _phase = p.phase;
                _currentMessage = p.desc;
                _lastUpdateTime = Date.now();
                if (m[1]) {
                    const a = parseInt(m[1], 10);
                    const b = m[2] ? parseInt(m[2], 10) : 0;
                    if (!isNaN(a)) {
                        if (b > 0) {
                            _channelsProcessed = a;
                            _channelsTotal = b;
                        } else if (a > _channelsTotal) {
                            _channelsTotal = a;
                        }
                    }
                }
                _update();
                if (p.phase === 'DONE') _scheduleAutoClose(2500);
                else if (p.phase === 'ERROR') _scheduleAutoClose(6000);
                break;
            }
        }
    }

    // Watchdog: si la fase actual es ≥ GENERATING y no hay updates por
    // INACTIVITY_TIMEOUT_MS, asumimos que el pipeline terminó (descarga finalizó,
    // VPS aceptó upload, o flow completó silenciosamente).
    function _checkInactivity() {
        if (!hudEl) return;
        if (_phase === 'DONE' || _phase === 'ERROR') return;
        const phasesAdvanced = ['GENERATING', 'UPLOADING', 'META-CLUSTER'];
        if (!phasesAdvanced.includes(_phase)) return;
        const inactiveMs = Date.now() - _lastUpdateTime;
        if (inactiveMs > INACTIVITY_TIMEOUT_MS) {
            _phase = 'DONE';
            _currentMessage = 'Pipeline finalizado (inactividad)';
            _update();
            _scheduleAutoClose(2000);
        }
    }

    function _scheduleAutoClose(ms) {
        if (_autoCloseTimer) clearTimeout(_autoCloseTimer);
        _autoCloseTimer = setTimeout(() => hide(), ms);
    }

    function _update() {
        if (!hudEl) return;
        const phaseEl = hudEl.querySelector('#ape-gen-hud-phase');
        const channelsEl = hudEl.querySelector('#ape-gen-hud-channels');
        const barEl = hudEl.querySelector('#ape-gen-hud-bar');
        const pctEl = hudEl.querySelector('#ape-gen-hud-pct');
        const badgeEl = hudEl.querySelector('#ape-gen-hud-badge');

        if (phaseEl) phaseEl.textContent = `${_phase} — ${_currentMessage}`;

        if (channelsEl) {
            if (_channelsProcessed > 0 && _channelsTotal > 0) {
                channelsEl.textContent = `${_channelsProcessed.toLocaleString()} / ${_channelsTotal.toLocaleString()}`;
            } else if (_channelsTotal > 0) {
                channelsEl.textContent = _channelsTotal.toLocaleString();
            } else {
                channelsEl.textContent = '—';
            }
        }

        const pct = PHASE_PROGRESS[_phase] != null ? PHASE_PROGRESS[_phase] : 5;
        if (barEl) barEl.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';

        if (badgeEl && phaseEl) {
            if (_phase === 'DONE') {
                badgeEl.textContent = '✅ OK';
                badgeEl.style.color = '#4ade80';
                badgeEl.style.background = 'rgba(74,222,128,0.15)';
                badgeEl.style.borderColor = 'rgba(74,222,128,0.4)';
                phaseEl.style.color = '#4ade80';
                if (barEl) barEl.style.background = 'linear-gradient(90deg,#22c55e,#16a34a)';
            } else if (_phase === 'ERROR') {
                badgeEl.textContent = '❌ ERR';
                badgeEl.style.color = '#f87171';
                badgeEl.style.background = 'rgba(248,113,113,0.15)';
                badgeEl.style.borderColor = 'rgba(248,113,113,0.4)';
                phaseEl.style.color = '#f87171';
                if (barEl) barEl.style.background = '#dc2626';
            } else if (_phase === 'UPLOADING') {
                badgeEl.textContent = '☁ UP';
                badgeEl.style.color = '#a855f7';
                badgeEl.style.background = 'rgba(168,85,247,0.15)';
                badgeEl.style.borderColor = 'rgba(168,85,247,0.4)';
                phaseEl.style.color = '#c084fc';
                if (barEl) barEl.style.background = 'linear-gradient(90deg,#a855f7,#7c3aed)';
            } else if (_phase === 'GENERATING') {
                badgeEl.textContent = '⚙ GEN';
                badgeEl.style.color = '#fbbf24';
                badgeEl.style.background = 'rgba(251,191,36,0.15)';
                badgeEl.style.borderColor = 'rgba(251,191,36,0.4)';
                phaseEl.style.color = '#fbbf24';
                if (barEl) barEl.style.background = 'linear-gradient(90deg,#f59e0b,#d97706)';
            } else {
                badgeEl.textContent = 'PROC';
                badgeEl.style.color = '#38bdf8';
                badgeEl.style.background = 'rgba(14,165,233,0.15)';
                badgeEl.style.borderColor = 'rgba(14,165,233,0.3)';
                phaseEl.style.color = '#38bdf8';
                if (barEl) barEl.style.background = 'linear-gradient(90deg,#0ea5e9,#2563eb)';
            }
        }
    }

    function _startTimer() {
        if (_timerInterval) clearInterval(_timerInterval);
        _timerInterval = setInterval(() => {
            if (!hudEl) {
                clearInterval(_timerInterval);
                _timerInterval = null;
                return;
            }
            const elapsed = (Date.now() - _startTime) / 1000;
            const timeEl = hudEl.querySelector('#ape-gen-hud-time');
            if (timeEl) timeEl.textContent = elapsed.toFixed(1) + 's';
        }, 100);
    }

    function _installToastHook() {
        if (_origToast) return;
        try {
            if (window.app && typeof window.app.showToast === 'function') {
                _origToast = window.app.showToast;
                window.app.showToast = function (msg, type) {
                    try {
                        if (typeof msg === 'string') {
                            // Cualquier toast de éxito o error tras la fase de generación
                            // se considera señal terminal del pipeline.
                            if (/✅|completada|completado|descargada|exitosa/i.test(msg)) {
                                _phase = 'DONE';
                                _currentMessage = 'Pipeline finalizado';
                                _lastUpdateTime = Date.now();
                                _update();
                                _scheduleAutoClose(1500);
                            } else if (/❌|error|cancelada|abortada|fall[oó]/i.test(msg)) {
                                _phase = 'ERROR';
                                _currentMessage = 'Pipeline con error';
                                _lastUpdateTime = Date.now();
                                _update();
                                _scheduleAutoClose(4000);
                            }
                        }
                    } catch (_) {}
                    return _origToast.apply(window.app, arguments);
                };
            }
        } catch (_) {}
    }

    function _uninstallToastHook() {
        if (_origToast && window.app) {
            try { window.app.showToast = _origToast; } catch (_) {}
            _origToast = null;
        }
    }

    function show() {
        if (hudEl) hide();
        _startTime = Date.now();
        _lastUpdateTime = Date.now();
        _phase = 'INIT';
        _channelsTotal = 0;
        _channelsProcessed = 0;
        _currentMessage = 'preparando';
        hudEl = _createHUD();
        document.body.appendChild(hudEl);
        // Animación de entrada
        hudEl.style.opacity = '0';
        hudEl.style.transform = 'translateX(20px)';
        requestAnimationFrame(() => {
            hudEl.style.opacity = '1';
            hudEl.style.transform = 'translateX(0)';
        });
        _installLogProxy();
        _installToastHook();
        _startTimer();
        // Watchdog de inactividad: revisa cada 5s si llevamos 45s sin updates
        if (_inactivityInterval) clearInterval(_inactivityInterval);
        _inactivityInterval = setInterval(_checkInactivity, 5000);
        _update();
    }

    function hide() {
        if (_autoCloseTimer) { clearTimeout(_autoCloseTimer); _autoCloseTimer = null; }
        if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
        if (_inactivityInterval) { clearInterval(_inactivityInterval); _inactivityInterval = null; }
        if (hudEl) {
            // Animación de salida
            hudEl.style.opacity = '0';
            hudEl.style.transform = 'translateX(20px)';
            const toRemove = hudEl;
            hudEl = null;
            setTimeout(() => { try { toRemove.remove(); } catch (_) {} }, 300);
        }
        _uninstallLogProxy();
        _uninstallToastHook();
    }

    window.GenerationHUD = { show: show, hide: hide };

    console.log('%c🩺 Generation HUD Overlay v1.1 (compacto) cargado',
                'color:#0EA5E9; font-weight:bold;');
})();
