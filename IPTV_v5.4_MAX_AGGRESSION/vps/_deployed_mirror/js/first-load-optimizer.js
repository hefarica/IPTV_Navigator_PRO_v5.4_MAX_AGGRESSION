/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 APE FIRST LOAD OPTIMIZER v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Pantalla de carga completa SOLO para primera apertura de la aplicación
 * Con barra de progreso verde fluorescente, porcentaje y pasos detallados
 * 
 * AUTOR: APE Optimization Team
 * FECHA: 2026-01-12
 * VERSIÓN: 1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
    'use strict';
    
    // ═══════════════════════════════════════════════════════════════════════
    // DETECCIÓN DE PRIMERA CARGA
    // ═══════════════════════════════════════════════════════════════════════
    
    function isFirstLoad() {
        // Si ya hay una sesión activa, es refresh
        if (sessionStorage.getItem('ape_session_started')) {
            return false;
        }
        // Marcar sesión como iniciada
        sessionStorage.setItem('ape_session_started', 'true');
        return true;
    }
    
    // Solo ejecutar en primera carga
    if (!isFirstLoad()) {
        console.log('🔄 [FIRST-LOAD] Sesión existente, usando splash simple');
        return;
    }
    
    console.log('🚀 [FIRST-LOAD] Primera carga detectada, iniciando splash completo');
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    
    const CONFIG = {
        loadSteps: [
            { id: 'init', label: 'Iniciando sistema APE...' },
            { id: 'dom', label: 'Preparando interfaz...' },
            { id: 'scripts', label: 'Cargando módulos JavaScript...' },
            { id: 'database', label: 'Conectando IndexedDB...' },
            { id: 'servers', label: 'Restaurando servidores...' },
            { id: 'channels', label: 'Cargando canales...' },
            { id: 'ui', label: 'Renderizando interfaz...' },
            { id: 'ready', label: '¡Sistema listo!' }
        ]
    };
    
    // ═══════════════════════════════════════════════════════════════════════
    // INYECTAR CSS
    // ═══════════════════════════════════════════════════════════════════════
    
    const styles = document.createElement('style');
    styles.id = 'first-load-styles';
    styles.textContent = `
        /* 🦍 APE First Load Splash - Verde Fluorescente */
        #first-load-splash {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: radial-gradient(ellipse at center, #0a1628 0%, #050816 50%, #000 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.6s ease, visibility 0.6s ease;
        }
        
        #first-load-splash.fade-out {
            opacity: 0;
            visibility: hidden;
        }
        
        .fl-content {
            text-align: center;
            max-width: 420px;
            padding: 40px;
        }
        
        .fl-logo {
            font-size: 80px;
            margin-bottom: 10px;
            animation: fl-pulse-glow 2s ease-in-out infinite;
            filter: drop-shadow(0 0 30px rgba(0, 255, 136, 0.5));
        }
        
        @keyframes fl-pulse-glow {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(0, 255, 136, 0.4)); }
            50% { transform: scale(1.05); filter: drop-shadow(0 0 40px rgba(0, 255, 136, 0.8)); }
        }
        
        .fl-content h1 {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: #fff;
            margin: 0 0 8px 0;
            letter-spacing: -0.5px;
        }
        
        .fl-version {
            font-size: 12px;
            color: #00ff88;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 30px;
            text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        }
        
        .fl-progress-container {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
            margin: 25px 0 15px;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        
        .fl-progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #00ff88, #00ffcc, #00ff88);
            background-size: 200% 100%;
            border-radius: 10px;
            transition: width 0.4s ease-out;
            box-shadow: 0 0 15px rgba(0, 255, 136, 0.6), 0 0 30px rgba(0, 255, 136, 0.3);
            animation: fl-shimmer 1.5s linear infinite;
        }
        
        @keyframes fl-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        
        .fl-percent {
            font-size: 32px;
            font-weight: 700;
            color: #00ff88;
            text-shadow: 0 0 20px rgba(0, 255, 136, 0.8), 0 0 40px rgba(0, 255, 136, 0.4);
            margin: 15px 0 10px;
            font-family: 'SF Mono', 'Consolas', monospace;
        }
        
        .fl-message {
            font-size: 13px;
            color: #00ff88;
            margin: 0;
            min-height: 20px;
            text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
            font-family: 'SF Mono', 'Consolas', monospace;
            letter-spacing: 0.5px;
            animation: fl-text-flicker 3s ease-in-out infinite;
        }
        
        @keyframes fl-text-flicker {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }
        
        .fl-steps {
            margin-top: 25px;
            text-align: left;
            max-height: 180px;
            overflow: hidden;
        }
        
        .fl-step {
            font-size: 11px;
            color: rgba(0, 255, 136, 0.4);
            padding: 4px 0;
            font-family: 'SF Mono', 'Consolas', monospace;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .fl-step.active {
            color: #00ff88;
            text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
        }
        
        .fl-step.completed {
            color: rgba(0, 255, 136, 0.6);
        }
        
        .fl-step-icon {
            width: 14px;
            text-align: center;
            font-size: 10px;
        }
        
        .fl-step.active .fl-step-icon::before {
            content: '▸';
            animation: fl-blink 0.8s ease-in-out infinite;
        }
        
        .fl-step.completed .fl-step-icon::before {
            content: '✓';
        }
        
        .fl-step.pending .fl-step-icon::before {
            content: '○';
        }
        
        @keyframes fl-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        
        /* Ocultar contenido principal */
        body.fl-loading .app-shell {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;
    document.head.appendChild(styles);
    
    // ═══════════════════════════════════════════════════════════════════════
    // CREAR SPLASH
    // ═══════════════════════════════════════════════════════════════════════
    
    // Marcar body como cargando
    document.body.classList.add('fl-loading');
    
    const stepsHTML = CONFIG.loadSteps.map(step => `
        <div class="fl-step pending" data-step="${step.id}">
            <span class="fl-step-icon"></span>
            <span>${step.label}</span>
        </div>
    `).join('');
    
    const splash = document.createElement('div');
    splash.id = 'first-load-splash';
    splash.innerHTML = `
        <div class="fl-content">
            <div class="fl-logo">🦍</div>
            <h1>IPTV Navigator PRO</h1>
            <div class="fl-version">APE ENGINE v9.0</div>
            <div class="fl-progress-container">
                <div class="fl-progress-bar" id="fl-progress"></div>
            </div>
            <div class="fl-percent" id="fl-percent">0%</div>
            <p class="fl-message" id="fl-message">Iniciando sistema APE...</p>
            <div class="fl-steps" id="fl-steps">
                ${stepsHTML}
            </div>
        </div>
    `;
    document.body.prepend(splash);
    
    // ═══════════════════════════════════════════════════════════════════════
    // API DE PROGRESO
    // ═══════════════════════════════════════════════════════════════════════
    
    function updateProgress(percent, message, stepId) {
        const progressBar = document.getElementById('fl-progress');
        const percentEl = document.getElementById('fl-percent');
        const messageEl = document.getElementById('fl-message');
        
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
        if (messageEl && message) messageEl.textContent = message;
        
        // Actualizar pasos
        if (stepId) {
            const steps = document.querySelectorAll('.fl-step');
            let foundCurrent = false;
            
            steps.forEach(step => {
                const id = step.dataset.step;
                if (id === stepId) {
                    step.classList.remove('pending', 'completed');
                    step.classList.add('active');
                    foundCurrent = true;
                } else if (!foundCurrent) {
                    step.classList.remove('pending', 'active');
                    step.classList.add('completed');
                } else {
                    step.classList.remove('active', 'completed');
                    step.classList.add('pending');
                }
            });
        }
    }
    
    function hideSplash() {
        const splash = document.getElementById('first-load-splash');
        if (splash) {
            splash.classList.add('fade-out');
            document.body.classList.remove('fl-loading');
            setTimeout(() => splash.remove(), 600);
        }
    }
    
    // Exponer API global
    window.FirstLoadOptimizer = {
        updateProgress,
        hideSplash
    };
    
    // ═══════════════════════════════════════════════════════════════════════
    // SECUENCIA DE CARGA AUTOMÁTICA
    // ═══════════════════════════════════════════════════════════════════════
    
    async function runLoadSequence() {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        
        // Paso 1: Init
        updateProgress(5, 'Iniciando sistema APE...', 'init');
        await delay(300);
        
        // Paso 2: DOM
        updateProgress(15, 'Preparando interfaz...', 'dom');
        await delay(400);
        
        // Paso 3: Scripts
        updateProgress(25, 'Cargando módulos JavaScript...', 'scripts');
        
        // Esperar a que el DOM esté listo
        await new Promise(resolve => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
        
        // Paso 4: Database
        updateProgress(40, 'Conectando IndexedDB...', 'database');
        await delay(500);
        
        // Paso 5: Servers
        updateProgress(55, 'Restaurando servidores...', 'servers');
        
        // Esperar a que window.app exista
        let attempts = 0;
        while (!window.app && attempts < 100) {
            await delay(100);
            attempts++;
        }
        
        // Paso 6: Channels
        updateProgress(70, 'Cargando canales...', 'channels');
        
        if (window.app) {
            // Esperar canales
            let channelAttempts = 0;
            while ((!window.app.state?.channelsMaster || window.app.state.channelsMaster.length === 0) && channelAttempts < 50) {
                await delay(200);
                channelAttempts++;
                const progress = 70 + Math.min(channelAttempts * 0.4, 15);
                updateProgress(progress, 'Cargando canales...', 'channels');
            }
        }
        
        // Paso 7: UI
        updateProgress(90, 'Renderizando interfaz...', 'ui');
        await delay(400);
        
        // Paso 8: Ready
        updateProgress(100, '¡Sistema listo!', 'ready');
        await delay(800);
        
        // Ocultar splash
        hideSplash();
        
        console.log('🚀 [FIRST-LOAD] Secuencia completada');
    }
    
    // Iniciar secuencia
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runLoadSequence);
    } else {
        runLoadSequence();
    }
    
})();
