/**
 * APE PRISMA — ADB Hardening Frontend Module
 * 
 * Integración con el frontend IPTV Navigator para aplicar
 * hardening ADB a dispositivos Android TV desde la UI.
 * 
 * Arquitectura:
 *   Frontend (browser) → NO puede ejecutar ADB directamente
 *   Solución: Genera el comando y el usuario lo ejecuta desde PowerShell/CMD
 *   
 *   Flujo:
 *   1. Usuario hace click en "Aplicar Hardening" 
 *   2. Frontend muestra el comando ADB listo para copiar
 *   3. Usuario pega en PowerShell → se ejecuta en el device
 *   4. Frontend verifica resultado via polling del device
 */

const ADB_HARDENING = {
    version: '2.0',
    
    // Dispositivos registrados
    devices: {
        onn_4k: {
            name: 'ONN 4K (Buga)',
            ip: '192.168.10.28',
            port: 5555,
            platform: 'amlogic_s905x4',
            network: 'lan',
            icon: '📺',
            features: ['aipq', 'aisr', 'vulkan', 'hdr10plus']
        },
        firetv_4k: {
            name: 'Fire TV Stick 4K Max',
            ip: '10.200.0.3',
            port: 5555,
            platform: 'mediatek_mt8696',
            network: 'wireguard',
            icon: '🔥',
            features: ['vulkan', 'hdr10']
        }
    },

    // Settings esperados (para verificación)
    expectedSettings: {
        always_hdr: '1',
        hdr_conversion_mode: '3',
        hdr_force_conversion_type: '4',
        display_color_mode: '3',
        window_animation_scale: '0.0',
        force_gpu_rendering: '1',
        tcp_default_init_rwnd: '60',
        wifi_sleep_policy: '2',
        stay_on_while_plugged_in: '3',
        encoded_surround_output: '1'
    },

    /**
     * Genera el one-liner ADB para un device específico
     */
    generateCommand(deviceId = 'onn_4k') {
        const device = this.devices[deviceId];
        if (!device) return null;
        const target = `${device.ip}:${device.port}`;
        const adb = 'C:\\Android\\platform-tools\\adb.exe';
        
        return {
            connect: `${adb} connect ${target}`,
            
            oneLiner: `${adb} connect ${target} && ${adb} -s ${target} push "${this.getScriptPath()}" /data/local/tmp/ape-adb-hardening.sh && ${adb} -s ${target} shell "chmod 755 /data/local/tmp/ape-adb-hardening.sh && sh /data/local/tmp/ape-adb-hardening.sh"`,
            
            directApply: `${adb} -s ${target} shell "sh /data/local/tmp/ape-adb-hardening.sh"`,
            
            verify: `${adb} -s ${target} shell "echo HDR=$(settings get global always_hdr) CONV=$(settings get global hdr_conversion_mode) AIPQ=$(settings get system aipq_enable) GPU=$(settings get global force_gpu_rendering) ANIM=$(settings get global window_animation_scale)"`,

            bat: `"${this.getBatPath()}" ${target}`
        };
    },

    getScriptPath() {
        return 'ape-adb-hardening.sh';
    },

    getBatPath() {
        return 'ape-adb-apply.bat';
    },

    /**
     * Renderiza el panel de hardening en el frontend
     */
    renderPanel(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
        <div class="adb-hardening-panel" style="
            background: linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a0a 100%);
            border: 1px solid rgba(0, 255, 136, 0.3);
            border-radius: 16px;
            padding: 24px;
            color: #e0e0e0;
            font-family: 'Inter', 'Segoe UI', sans-serif;
        ">
            <h3 style="color: #00ff88; margin: 0 0 16px 0; font-size: 18px;">
                🛡️ APE PRISMA — ADB Hardening
            </h3>
            <p style="color: #888; font-size: 13px; margin-bottom: 20px;">
                44 directivas de imagen, AI, GPU, red y energía para máximo rendimiento IPTV.
                Idempotente — seguro de ejecutar las veces que quieras.
            </p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                ${Object.entries(this.devices).map(([id, dev]) => `
                    <button onclick="ADB_HARDENING.showCommands('${id}')" style="
                        background: rgba(0, 255, 136, 0.1);
                        border: 1px solid rgba(0, 255, 136, 0.3);
                        border-radius: 12px;
                        padding: 16px;
                        color: #00ff88;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.background='rgba(0,255,136,0.2)'" 
                       onmouseout="this.style.background='rgba(0,255,136,0.1)'">
                        <div style="font-size: 24px; margin-bottom: 8px;">${dev.icon}</div>
                        <div style="font-weight: 600; font-size: 14px;">${dev.name}</div>
                        <div style="color: #666; font-size: 11px; margin-top: 4px;">
                            ${dev.ip}:${dev.port} · ${dev.network.toUpperCase()}
                        </div>
                        <div style="color: #555; font-size: 10px; margin-top: 4px;">
                            ${dev.features.map(f => f.toUpperCase()).join(' · ')}
                        </div>
                    </button>
                `).join('')}
            </div>
            
            <div id="adb-command-output" style="display: none;"></div>
        </div>`;
    },

    /**
     * Muestra los comandos para un device específico
     */
    showCommands(deviceId) {
        const cmds = this.generateCommand(deviceId);
        const device = this.devices[deviceId];
        const output = document.getElementById('adb-command-output');
        if (!output || !cmds) return;

        output.style.display = 'block';
        output.innerHTML = `
        <div style="
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(0, 255, 136, 0.15);
            border-radius: 12px;
            padding: 16px;
            margin-top: 12px;
        ">
            <h4 style="color: #00ff88; margin: 0 0 12px 0;">
                ${device.icon} ${device.name} — Comandos
            </h4>
            
            <div style="margin-bottom: 12px;">
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">
                    📋 OPCIÓN 1: One-liner (primera vez — push + ejecutar)
                </label>
                <div style="position: relative;">
                    <pre onclick="ADB_HARDENING.copyCommand(this)" style="
                        background: #0a0a0a;
                        border: 1px solid #333;
                        border-radius: 8px;
                        padding: 12px;
                        color: #00ff88;
                        font-size: 11px;
                        white-space: pre-wrap;
                        word-break: break-all;
                        cursor: pointer;
                        margin: 0;
                        line-height: 1.5;
                    ">${cmds.oneLiner}</pre>
                    <span style="position: absolute; top: 8px; right: 8px; color: #555; font-size: 10px;">
                        Click para copiar
                    </span>
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">
                    ⚡ OPCIÓN 2: Re-aplicar (script ya en el device)
                </label>
                <pre onclick="ADB_HARDENING.copyCommand(this)" style="
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px;
                    color: #ffaa00;
                    font-size: 11px;
                    white-space: pre-wrap;
                    word-break: break-all;
                    cursor: pointer;
                    margin: 0;
                ">${cmds.directApply}</pre>
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">
                    🔍 OPCIÓN 3: Solo verificar
                </label>
                <pre onclick="ADB_HARDENING.copyCommand(this)" style="
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px;
                    color: #44aaff;
                    font-size: 11px;
                    white-space: pre-wrap;
                    word-break: break-all;
                    cursor: pointer;
                    margin: 0;
                ">${cmds.verify}</pre>
            </div>
            
            <div>
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">
                    🗃️ OPCIÓN 4: BAT file (doble-click desde Windows)
                </label>
                <pre onclick="ADB_HARDENING.copyCommand(this)" style="
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px;
                    color: #ff6688;
                    font-size: 11px;
                    white-space: pre-wrap;
                    word-break: break-all;
                    cursor: pointer;
                    margin: 0;
                ">${cmds.bat}</pre>
            </div>
        </div>`;
    },

    /**
     * Copia un comando al clipboard
     */
    copyCommand(element) {
        const text = element.textContent.trim();
        navigator.clipboard.writeText(text).then(() => {
            const originalColor = element.style.color;
            element.style.color = '#00ff00';
            element.style.borderColor = '#00ff00';
            setTimeout(() => {
                element.style.color = originalColor;
                element.style.borderColor = '#333';
            }, 1500);
        });
    }
};

// Auto-expose globally
if (typeof window !== 'undefined') {
    window.ADB_HARDENING = ADB_HARDENING;
}
