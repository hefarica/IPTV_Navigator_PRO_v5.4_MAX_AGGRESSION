/**
 * ═══════════════════════════════════════════════════════════════
 * 🔧 SNIPPET: Integración de Custom Headers en Generador M3U8
 * ═══════════════════════════════════════════════════════════════
 * 
 * Este código debe agregarse al generador M3U8 existente para
 * soportar headers personalizados del Profile Manager.
 * 
 * UBICACIÓN: Dentro de la función que genera headers por canal
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// MÉTODO 1: Función Helper para Formatear Headers
// ═══════════════════════════════════════════════════════════════

/**
 * Formatea un header HTTP según el formato apropiado para M3U8
 * @param {string} name - Nombre del header
 * @param {string} value - Valor del header
 * @param {string} format - Formato deseado: 'extvlcopt', 'kodiprop', 'pipe'
 * @returns {string} Header formateado
 */
function formatHeaderForM3U8(name, value, format = 'auto') {
    // Sanitizar valores
    name = (name || '').trim();
    value = (value || '').toString().trim();

    if (!name) return '';

    // Auto-detectar formato basado en el nombre del header
    if (format === 'auto') {
        if (name.toLowerCase().startsWith('http-')) {
            format = 'extvlcopt';
        } else if (name.startsWith('X-') || name === 'User-Agent' || name === 'Referer' || name === 'Origin') {
            format = 'kodiprop';
        } else {
            format = 'extvlcopt';
        }
    }

    // Formatear según tipo
    switch (format) {
        case 'kodiprop':
            return `#KODIPROP:${name}=${value}`;

        case 'extvlcopt':
            // Para headers HTTP estándar
            if (name.toLowerCase() === 'user-agent') {
                return `#EXTVLCOPT:http-user-agent=${value}`;
            } else if (name.toLowerCase() === 'referer') {
                return `#EXTVLCOPT:http-referrer=${value}`;
            } else if (name.toLowerCase().startsWith('http-')) {
                return `#EXTVLCOPT:${name}=${value}`;
            } else {
                return `#EXTVLCOPT:http-header=${name}: ${value}`;
            }

        case 'pipe':
            // Formato pipe para headers inline
            return `${name}: ${value}`;

        default:
            return `#EXTVLCOPT:${name}=${value}`;
    }
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 2: Función Principal de Generación de Headers
// ═══════════════════════════════════════════════════════════════

/**
 * Genera todos los headers para un canal (base + personalizados)
 * @param {Object} channel - Datos del canal
 * @param {Object} profile - Perfil APE activo
 * @returns {string} Headers formateados para M3U8
 */
function generateChannelHeadersComplete(channel, profile) {
    const headersArray = [];

    // ───────────────────────────────────────────────────────────
    // 1. HEADERS BASE DEL PERFIL (desde categorías)
    // ───────────────────────────────────────────────────────────

    if (profile.headers && typeof profile.headers === 'object') {
        for (const categoryKey in profile.headers) {
            const category = profile.headers[categoryKey];

            if (Array.isArray(category)) {
                for (const header of category) {
                    // Solo incluir si está habilitado
                    if (header.enabled !== false) {
                        const formatted = formatHeaderForM3U8(header.name, header.value);
                        if (formatted) {
                            headersArray.push(formatted);
                        }
                    }
                }
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // 2. ⭐ HEADERS PERSONALIZADOS (Custom Headers)
    // ───────────────────────────────────────────────────────────

    if (profile.customHeaders && Array.isArray(profile.customHeaders)) {
        for (const customHeader of profile.customHeaders) {
            // Solo incluir si está habilitado
            if (customHeader.enabled) {
                const formatted = formatHeaderForM3U8(
                    customHeader.name,
                    customHeader.value,
                    customHeader.format || 'auto'
                );

                if (formatted) {
                    headersArray.push(formatted);
                }
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // 3. HEADERS DINÁMICOS (si aplica)
    // ───────────────────────────────────────────────────────────

    // Ejemplo: Reemplazar placeholders dinámicos
    return headersArray.map(header => {
        return header
            .replace('[TIMESTAMP]', Date.now())
            .replace('[GENERATE_UUID]', generateUUID())
            .replace('[HTTP_DATE]', new Date().toUTCString())
            .replace('[CONFIG_SESSION_ID]', getSessionId())
            .replace('[CHANNEL_ID]', channel.id || '')
            .replace('[CHANNEL_NAME]', channel.name || '');
    }).join('\n');
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 3: Integración con Generador M3U8 Existente
// ═══════════════════════════════════════════════════════════════

/**
 * EJEMPLO DE INTEGRACIÓN EN TU GENERADOR EXISTENTE
 * 
 * Busca en tu código una función similar a esta y reemplázala
 * o modifícala para usar las funciones anteriores.
 */

// ANTES (Ejemplo de código típico):
/*
function generateM3U8(channels, profile) {
    let m3u8Content = '#EXTM3U\n\n';
    
    for (const channel of channels) {
        m3u8Content += `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}", ${channel.name}\n`;
        m3u8Content += `#EXTVLCOPT:http-user-agent=Mozilla/5.0...\n`;
        m3u8Content += `${channel.url}\n\n`;
    }
    
    return m3u8Content;
}
*/

// DESPUÉS (Con custom headers integrado):
function generateM3U8Enhanced(channels, profile) {
    let m3u8Content = '#EXTM3U\n\n';

    for (const channel of channels) {
        // Información del canal
        m3u8Content += `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}"`;

        // Agregar atributos adicionales si existen
        if (channel.logo) m3u8Content += ` tvg-logo="${channel.logo}"`;
        if (channel.group) m3u8Content += ` group-title="${channel.group}"`;

        m3u8Content += `,${channel.name}\n`;

        // ⭐ HEADERS COMPLETOS (Base + Custom)
        const headers = generateChannelHeadersComplete(channel, profile);
        if (headers) {
            m3u8Content += headers + '\n';
        }

        // URL del stream
        m3u8Content += `${channel.url}\n\n`;
    }

    return m3u8Content;
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 4: Integración con Profile Manager
// ═══════════════════════════════════════════════════════════════

/**
 * OPCIÓN ALTERNATIVA: Usar método del Profile Manager directamente
 */
function generateM3U8UsingProfileManager(channels) {
    // Obtener perfil activo del Profile Manager
    const PM = window.ProfileManagerV9;
    const profile = PM.currentProfile;

    if (!profile) {
        console.error('❌ No hay perfil activo');
        return '';
    }

    // Obtener headers completos desde el PM
    const allHeaders = PM.getCompleteHeadersForM3U8();

    let m3u8Content = '#EXTM3U\n';
    m3u8Content += `# Generado con APE v9.0 - Profile: ${profile.name}\n`;
    m3u8Content += `# Fecha: ${new Date().toISOString()}\n\n`;

    for (const channel of channels) {
        m3u8Content += `#EXTINF:-1 tvg-id="${channel.id}",${channel.name}\n`;

        // Formatear y agregar headers
        for (const header of allHeaders) {
            const formatted = formatHeaderForM3U8(header.name, header.value);
            if (formatted) {
                m3u8Content += formatted + '\n';
            }
        }

        m3u8Content += `${channel.url}\n\n`;
    }

    return m3u8Content;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS ADICIONALES
// ═══════════════════════════════════════════════════════════════

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getSessionId() {
    // Reutilizar sessionId si ya existe
    if (!window._apeSessionId) {
        window._apeSessionId = generateUUID();
    }
    return window._apeSessionId;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTAR (si usas módulos ES6)
// ═══════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatHeaderForM3U8,
        generateChannelHeadersComplete,
        generateM3U8Enhanced,
        generateM3U8UsingProfileManager
    };
}

// ═══════════════════════════════════════════════════════════════
// EJEMPLO DE USO
// ═══════════════════════════════════════════════════════════════

/*
// 1. Obtener canales y perfil
const channels = app.state.filteredChannels;
const profile = window.ProfileManagerV9.currentProfile;

// 2. Generar M3U8 con headers personalizados
const m3u8Content = generateM3U8Enhanced(channels, profile);

// 3. Descargar archivo
const blob = new Blob([m3u8Content], { type: 'application/vnd.apple.mpegurl' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `APE_CUSTOM_${Date.now()}.m3u8`;
a.click();
URL.revokeObjectURL(url);
*/

console.log('%c✅ M3U8 Generator - Custom Headers Integration Loaded', 'color: #10b981; font-weight: bold;');
