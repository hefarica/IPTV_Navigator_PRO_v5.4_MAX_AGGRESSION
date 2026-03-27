/**
 * ═══════════════════════════════════════════════════════════════════════
 * validate_m3u8_compat.js — Auditor de Compatibilidad Universal M3U8
 * v6.1 COMPAT VALIDATOR + RULES ENGINE
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Uso:
 *   node validate_m3u8_compat.js <archivo.m3u8>
 * 
 * MOTOR DE REGLAS: Cada clave tiene una política de dirección:
 *   NEVER_DOWN    — Valor puede subir (más agresivo) pero NUNCA bajar
 *   NEVER_UP      — Valor puede bajar pero NUNCA subir (ej: hurry-up=0)
 *   EXACT_MATCH   — Debe ser idéntico siempre que aparezca
 *   FREE          — Puede cambiar libremente (no es contradicción)
 *   UNIQUE        — Solo puede aparecer UNA vez (duplicado siempre = error)
 * 
 * Detecta 10 tipos de issues, genera JSON report + console output.
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// REGLAS DE DIRECCIÓN — DICCIONARIO MAESTRO
// ═══════════════════════════════════════════════════════════════
// Formato: 'clave': { policy: 'NEVER_DOWN|NEVER_UP|EXACT_MATCH|FREE|UNIQUE', reason: '...' }

const VLC_RULES = {
    // ── CACHING: Siempre subir = más buffer = más agresivo ──
    'network-caching':    { policy: 'NEVER_DOWN', reason: 'Más caching = más agresión de red. Bajar degrada la experiencia.' },
    'live-caching':       { policy: 'NEVER_DOWN', reason: 'Live cache más alto = menos freezes en streams en vivo.' },
    'file-caching':       { policy: 'NEVER_DOWN', reason: 'File cache más alto = más headroom para disco.' },
    'disc-caching':       { policy: 'NEVER_DOWN', reason: 'Disc cache solo sube para máxima disponibilidad.' },
    'tcp-caching':        { policy: 'NEVER_DOWN', reason: 'TCP cache más alto = más resiliencia ante jitter de red.' },
    'sout-mux-caching':   { policy: 'NEVER_DOWN', reason: 'Sout mux cache sube para streams transcodificados.' },
    'adaptive-cache-size':{ policy: 'NEVER_DOWN', reason: 'Cache adaptativo más alto = más segmentos HLS cacheados.' },
    // ── CLOCK: Debe ser consistente — contradecir mata la sincronía ──
    'clock-synchro':      { policy: 'EXACT_MATCH', reason: '1=forzar sync, 0=libre. Contradecir desincroniza A/V.' },
    'clock-jitter':       { policy: 'NEVER_DOWN', reason: 'Jitter más alto = más tolerancia a variación de red.' },
    // ── HARDWARE DECODE: Debe ser consistente ──
    'avcodec-hw':         { policy: 'EXACT_MATCH', reason: 'Cambiar HW decoder mid-stream causa crash. "any" es definitivo.' },
    'avcodec-threads':    { policy: 'EXACT_MATCH', reason: '0=auto, cambiar causa conflicto de threads.' },
    'avcodec-dr':         { policy: 'EXACT_MATCH', reason: 'Direct rendering on/off no puede cambiar.' },
    'ffmpeg-hw':          { policy: 'UNIQUE', reason: 'Flag booleano, solo aparece una vez.' },
    // ── DEINTERLACE: Debe ser consistente — un solo modo ──
    'deinterlace':        { policy: 'EXACT_MATCH', reason: '-1=auto, 0=off, 1=on. Contradecir rompe el pipeline.' },
    'deinterlace-mode':   { policy: 'EXACT_MATCH', reason: 'Solo un modo: bwdif/yadif/auto. Múltiples confunde al decoder.' },
    // ── CODEC: Debe ser consistente ──
    'preferred-codec':    { policy: 'EXACT_MATCH', reason: 'Un solo codec preferido. Cambiar causa re-negociación.' },
    'codec-priority':     { policy: 'EXACT_MATCH', reason: 'La cadena de prioridad debe ser consistente.' },
    'avcodec-codec':      { policy: 'EXACT_MATCH', reason: 'Codec forzado no puede contradecirse.' },
    'sout-video-codec':   { policy: 'EXACT_MATCH', reason: 'Codec de salida fijo.' },
    'sout-video-profile': { policy: 'EXACT_MATCH', reason: 'Perfil de codec fijo (main10).' },
    // ── CALIDAD: NUNCA BAJAR — siempre máxima calidad ──
    'avcodec-hurry-up':   { policy: 'NEVER_UP', reason: '0=mejor calidad. Subir = degradar.' },
    'avcodec-fast':       { policy: 'NEVER_UP', reason: '0=mejor calidad. Subir = degradar.' },
    'avcodec-skiploopfilter': { policy: 'NEVER_UP', reason: '0=máxima calidad de filtro. Subir = saltar filtros.' },
    'avcodec-skipframe':  { policy: 'NEVER_UP', reason: '0=no saltar frames. Subir = degradar.' },
    'avcodec-skip-idct':  { policy: 'NEVER_UP', reason: '0=IDCT completa. Subir = aproximar.' },
    'avcodec-lowres':     { policy: 'NEVER_UP', reason: '0=resolución completa. Subir = sub-sample.' },
    'postproc-quality':   { policy: 'NEVER_DOWN', reason: 'Más post-procesamiento = mejor calidad.' },
    'swscale-mode':       { policy: 'NEVER_DOWN', reason: 'Modo más alto = mejor escalado (9=lanczos).' },
    // ── RESOLUCIÓN: NUNCA BAJAR ──
    'preferred-resolution': { policy: 'NEVER_DOWN', reason: 'Resolución preferida solo sube.' },
    'adaptive-maxwidth':  { policy: 'NEVER_DOWN', reason: 'Ancho máximo solo sube.' },
    'adaptive-maxheight': { policy: 'NEVER_DOWN', reason: 'Alto máximo solo sube.' },
    'adaptive-logic':     { policy: 'EXACT_MATCH', reason: '"highest" es definitivo.' },
    // ── RED: PRIORIDAD MÁXIMA ──
    'high-priority':      { policy: 'NEVER_DOWN', reason: '1=prioridad máxima, no puede bajar a 0.' },
    'mtu':                { policy: 'NEVER_DOWN', reason: 'MTU más alto = paquetes más grandes = más throughput.' },
    'network-synchronisation': { policy: 'EXACT_MATCH', reason: '1=sincronización de red activa, no cambiar.' },
    // ── HTTP RESILIENCE: Solo activar, nunca desactivar ──
    'http-reconnect':     { policy: 'EXACT_MATCH', reason: 'true=siempre reconectar. No se puede apagar.' },
    'http-continuous':    { policy: 'EXACT_MATCH', reason: 'true=streaming continuo. No se puede apagar.' },
    'http-forward-cookies': { policy: 'EXACT_MATCH', reason: 'true=siempre forward cookies. No se puede apagar.' },
    // ── SOUT ENCODER: Consistencia ──
    'sout-video-bitrate': { policy: 'NEVER_DOWN', reason: 'Bitrate de codificación solo sube.' },
    'sout-video-maxrate': { policy: 'NEVER_DOWN', reason: 'Bitrate máximo solo sube.' },
    'sout-video-bufsize': { policy: 'NEVER_DOWN', reason: 'Buffer de encoder solo sube.' },
    'sout-video-gop':     { policy: 'FREE', reason: 'GOP puede variar según contenido.' },
    'sout-video-tier':    { policy: 'EXACT_MATCH', reason: '"high" es definitivo.' },
    'sout-video-encoder': { policy: 'EXACT_MATCH', reason: 'Encoder fijo (nvenc_hevc).' },
    // ── VIDEO FILTER: Un solo valor compuesto ──
    'video-filter':       { policy: 'EXACT_MATCH', reason: 'La cadena de filtros es una sola. Duplicar reemplaza.' },
    // ── PLAYBACK ──
    'repeat':             { policy: 'NEVER_DOWN', reason: 'Más repeticiones = más persistencia.' },
    'input-repeat':       { policy: 'NEVER_DOWN', reason: 'Más repeticiones = nunca para.' },
    'fullscreen':         { policy: 'EXACT_MATCH', reason: '1=fullscreen, no cambiar.' }
};

const APE_RULES = {
    // ── BUFFER: NUNCA BAJAR ──
    'BUFFER-TARGET':      { policy: 'NEVER_DOWN', reason: 'Buffer target solo sube = más seguridad.' },
    'BUFFER-MIN':         { policy: 'NEVER_DOWN', reason: 'Buffer mínimo solo sube.' },
    'BUFFER-MAX':         { policy: 'NEVER_DOWN', reason: 'Buffer máximo solo sube.' },
    'BUFFER-STRATEGY':    { policy: 'EXACT_MATCH', reason: 'La estrategia de buffer es una sola.' },
    // ── RECONNECT: NUNCA BAJAR ──
    'RECONNECT-MAX':      { policy: 'EXACT_MATCH', reason: '"UNLIMITED" es definitivo.' },
    'RECONNECT-PARALLEL': { policy: 'NEVER_DOWN', reason: 'Más conexiones paralelas = más agresión.' },
    'RECONNECT-POOL':     { policy: 'NEVER_DOWN', reason: 'Pool más grande = más resiliencia.' },
    'RECONNECT-WARM-POOL':{ policy: 'NEVER_DOWN', reason: 'Warm pool más grande = failover más rápido.' },
    'RECONNECT-SEAMLESS': { policy: 'EXACT_MATCH', reason: '"TRUE" es definitivo.' },
    // ── ISP THROTTLE: NUNCA BAJAR — SOLO ESCALAR ──
    'ISP-THROTTLE-LEVEL': { policy: 'EXACT_MATCH', reason: '"AUTO_ESCALATE" es definitivo.' },
    'ISP-NEVER-DOWNGRADE':{ policy: 'EXACT_MATCH', reason: '"TRUE" es definitivo.' },
    // ── MULTI-SOURCE: NUNCA BAJAR ──
    'MULTI-SOURCE':       { policy: 'EXACT_MATCH', reason: '"ENABLED" es definitivo.' },
    'MULTI-SOURCE-COUNT': { policy: 'NEVER_DOWN', reason: 'Más fuentes = más redundancia.' },
    'MULTI-SOURCE-RACING':{ policy: 'EXACT_MATCH', reason: '"TRUE" = racing siempre activo.' },
    'MULTI-SOURCE-FAILOVER-MS': { policy: 'NEVER_UP', reason: 'Failover más rápido (ms menor) = mejor.' },
    // ── QUALITY: NUNCA BAJAR ──
    'QUALITY-NEVER-DROP-BELOW': { policy: 'FREE', reason: 'Resolución mínima es configurable.' },
    'QUALITY-FALLBACK-CHAIN':   { policy: 'EXACT_MATCH', reason: 'La cadena de fallback es una sola.' },
    // ── CLOCK: CONSISTENCIA ──
    'CLOCK-JITTER':       { policy: 'NEVER_DOWN', reason: 'Más tolerancia = mejor.' },
    'CLOCK-SYNCHRO':      { policy: 'EXACT_MATCH', reason: '1 = sync activo, no contradecir.' },
    // ── ERROR: SOLO ESCALAR ──
    'ERROR-RECOVERY':     { policy: 'EXACT_MATCH', reason: '"NUCLEAR" es el nivel máximo.' },
    'ERROR-MAX-RETRIES':  { policy: 'EXACT_MATCH', reason: '"UNLIMITED" es definitivo.' },
    // ── FREEZE: CONSISTENCIA ──
    'FREEZE-PREDICTION':  { policy: 'EXACT_MATCH', reason: '"ENABLED" es definitivo.' },
    'FREEZE-PREVENTION-AUTO': { policy: 'EXACT_MATCH', reason: '"TRUE" es definitivo.' },
    // ── FRAME INTERPOLATION ──
    'FRAME-INTERPOLATION':{ policy: 'EXACT_MATCH', reason: 'Modo de interpolación fijo.' }
};

const KODI_RULES = {
    'inputstream.adaptive.max_resolution':    { policy: 'NEVER_DOWN', reason: 'Resolución máxima solo sube.' },
    'inputstream.adaptive.resolution_secure_max': { policy: 'NEVER_DOWN', reason: 'Resolución segura solo sube.' },
    'inputstream.adaptive.max_bandwidth':     { policy: 'NEVER_DOWN', reason: 'Ancho de banda máximo solo sube.' },
    'inputstream.adaptive.initial_bandwidth': { policy: 'NEVER_DOWN', reason: 'Bitrate inicial solo sube (arranque agresivo).' },
    'inputstream.adaptive.initial_bitrate_max': { policy: 'NEVER_DOWN', reason: 'Bitrate inicial máximo solo sube.' },
    'inputstream.adaptive.max_fps':           { policy: 'NEVER_DOWN', reason: 'FPS máximo solo sube.' },
    'inputstream.adaptive.preferred_codec':   { policy: 'EXACT_MATCH', reason: 'Codec preferido fijo.' },
    'inputstream.adaptive.retry_max':         { policy: 'NEVER_DOWN', reason: 'Más reintentos = más agresión.' },
    'inputstream.adaptive.buffer_duration':   { policy: 'NEVER_DOWN', reason: 'Más duración de buffer = más seguridad.' },
    'inputstream.adaptive.manifest_reconnect':{ policy: 'EXACT_MATCH', reason: 'true = siempre reconectar manifiesto.' }
};

// ─────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────
const MAX_LINES_PER_CHANNEL = 700;
const MAX_FALLBACK_IDS = 2;

const PROFILE_RESOLUTION_MAP = {
    'P0': '7680x4320', 'P1': '3840x2160', 'P2': '3840x2160',
    'P3': '1920x1080', 'P4': '1280x720', 'P5': '854x480'
};
const PROFILE_MAX_BANDWIDTH = {
    'P0': 130000000, 'P1': 50000000, 'P2': 35000000,
    'P3': 15000000, 'P4': 8000000, 'P5': 3000000
};

// ─────────────────────────────────────────
// UTILIDADES DE COMPARACIÓN
// ─────────────────────────────────────────

function parseNumericValue(val) {
    // Extraer número de strings como "30000", "60s", "2048MB", "3840x2160"
    if (val === 'UNLIMITED' || val === 'TRUE' || val === 'ENABLED' || val === 'NUCLEAR') return Infinity;
    const match = String(val).match(/^(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

function parseResolution(val) {
    const m = String(val).match(/(\d+)x(\d+)/);
    return m ? parseInt(m[1]) * parseInt(m[2]) : null;
}

function compareValues(oldVal, newVal, policy) {
    // Para resoluciones (NxM), comparar por área total de píxeles
    const oldRes = parseResolution(oldVal);
    const newRes = parseResolution(newVal);
    if (oldRes !== null && newRes !== null) {
        if (policy === 'NEVER_DOWN' && newRes < oldRes) return { violation: true, direction: 'DOWN', msg: `Resolución bajó de ${oldVal} a ${newVal}` };
        if (policy === 'NEVER_UP' && newRes > oldRes) return { violation: true, direction: 'UP', msg: `Resolución subió de ${oldVal} a ${newVal}` };
        return { violation: false };
    }

    // Para valores numéricos
    const oldNum = parseNumericValue(oldVal);
    const newNum = parseNumericValue(newVal);
    if (oldNum !== null && newNum !== null) {
        if (policy === 'NEVER_DOWN' && newNum < oldNum) {
            return { violation: true, direction: 'DOWN', msg: `Valor bajó de ${oldVal} a ${newVal} (${oldNum} → ${newNum})` };
        }
        if (policy === 'NEVER_UP' && newNum > oldNum) {
            return { violation: true, direction: 'UP', msg: `Valor subió de ${oldVal} a ${newVal} (${oldNum} → ${newNum})` };
        }
        return { violation: false };
    }

    // Para strings: solo EXACT_MATCH aplica
    if (policy === 'EXACT_MATCH' && oldVal !== newVal) {
        return { violation: true, direction: 'CHANGE', msg: `Valor cambió de "${oldVal}" a "${newVal}"` };
    }

    return { violation: false };
}

// ─────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────

function parseChannelEntries(content) {
    const lines = content.split(/\r?\n/);
    const entries = [];
    let currentEntry = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = { extinf: line, lineNumber: i + 1, tags: [], url: null, profile: null, name: '' };
            const profileMatch = line.match(/ape-profile="([^"]+)"/);
            if (profileMatch) currentEntry.profile = profileMatch[1];
            const nameMatch = line.match(/,(.+)$/);
            if (nameMatch) currentEntry.name = nameMatch[1];
        } else if (currentEntry) {
            if (!line.startsWith('#') && (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp'))) {
                currentEntry.url = line;
                entries.push(currentEntry);
                currentEntry = null;
            } else {
                currentEntry.tags.push({ line, lineNumber: i + 1 });
            }
        }
    }
    if (currentEntry) entries.push(currentEntry);
    return entries;
}

// ─────────────────────────────────────────
// VALIDADORES CON MOTOR DE REGLAS
// ─────────────────────────────────────────

function validateWithRules(entry, tagPrefix, parseRegex, rulesDict, typeName) {
    const issues = [];
    const seen = {};

    for (const tag of entry.tags) {
        const match = tag.line.match(parseRegex);
        if (!match) continue;
        const [, key, value] = match;

        if (seen[key]) {
            const rule = rulesDict[key] || { policy: 'UNIQUE', reason: 'No hay regla definida — duplicado por defecto.' };
            
            if (rule.policy === 'UNIQUE') {
                issues.push({
                    type: `${typeName}_DUPLICATE`,
                    severity: 'FAIL',
                    key, policy: rule.policy,
                    firstValue: seen[key].value, firstLine: seen[key].lineNumber,
                    secondValue: value, secondLine: tag.lineNumber,
                    message: `🔴 ${typeName} DUPLICADO [UNIQUE]: ${key} aparece en L${seen[key].lineNumber} y L${tag.lineNumber}. ${rule.reason}`
                });
            } else if (rule.policy === 'EXACT_MATCH') {
                if (seen[key].value !== value) {
                    issues.push({
                        type: `${typeName}_CONTRADICTION`,
                        severity: 'FAIL',
                        key, policy: rule.policy,
                        firstValue: seen[key].value, firstLine: seen[key].lineNumber,
                        secondValue: value, secondLine: tag.lineNumber,
                        message: `🔴 ${typeName} CONTRADICCIÓN [EXACT_MATCH]: ${key}=${seen[key].value} (L${seen[key].lineNumber}) vs =${value} (L${tag.lineNumber}). ${rule.reason}`
                    });
                } else {
                    issues.push({
                        type: `${typeName}_REDUNDANT`,
                        severity: 'WARN',
                        key, policy: rule.policy,
                        message: `🟡 ${typeName} REDUNDANTE: ${key}=${value} aparece en L${seen[key].lineNumber} y L${tag.lineNumber} con mismo valor. No es error pero ocupa espacio.`
                    });
                }
            } else if (rule.policy === 'NEVER_DOWN' || rule.policy === 'NEVER_UP') {
                const result = compareValues(seen[key].value, value, rule.policy);
                if (result.violation) {
                    const icon = rule.policy === 'NEVER_DOWN' ? '📉' : '📈';
                    issues.push({
                        type: `${typeName}_DIRECTION_VIOLATION`,
                        severity: 'FAIL',
                        key, policy: rule.policy, direction: result.direction,
                        firstValue: seen[key].value, firstLine: seen[key].lineNumber,
                        secondValue: value, secondLine: tag.lineNumber,
                        message: `🔴 ${typeName} VIOLACIÓN [${rule.policy}]: ${icon} ${key} — ${result.msg}. ${rule.reason}`
                    });
                } else {
                    // Value went in allowed direction or stayed same
                    issues.push({
                        type: `${typeName}_ESCALATION`,
                        severity: 'INFO',
                        key, policy: rule.policy,
                        firstValue: seen[key].value, secondValue: value,
                        message: `✅ ${typeName} ESCALACIÓN OK [${rule.policy}]: ${key}=${seen[key].value} → ${value}. Dirección permitida.`
                    });
                }
            } else if (rule.policy === 'FREE') {
                // Free to change, just log
                issues.push({
                    type: `${typeName}_FREE_CHANGE`,
                    severity: 'INFO',
                    key, policy: rule.policy,
                    message: `ℹ️ ${typeName} CAMBIO LIBRE: ${key}=${seen[key].value} → ${value}. Permitido por regla FREE.`
                });
            }
            // Update the seen value to the latest (for chained checks)
            seen[key] = { value, lineNumber: tag.lineNumber };
        } else {
            seen[key] = { value, lineNumber: tag.lineNumber };
        }
    }
    return issues;
}

function validateExtvlcopt(entry) {
    return validateWithRules(entry, '#EXTVLCOPT', /^#EXTVLCOPT:([^=]+)=?(.*)$/, VLC_RULES, 'EXTVLCOPT');
}

function validateKodiprop(entry) {
    return validateWithRules(entry, '#KODIPROP', /^#KODIPROP:([^=]+)=(.*)$/, KODI_RULES, 'KODIPROP');
}

function validateApeTags(entry) {
    return validateWithRules(entry, '#EXT-X-APE', /^#EXT-X-APE-([^:]+):(.+)$/, APE_RULES, 'APE');
}

function validateFallbackIds(entry) {
    const issues = [];
    const fallbackIds = [];
    for (const tag of entry.tags) {
        const match = tag.line.match(/^#EXT-X-APE-FALLBACK-ID:(.+)$/);
        if (match) fallbackIds.push({ id: match[1], lineNumber: tag.lineNumber });
    }
    if (fallbackIds.length > MAX_FALLBACK_IDS) {
        issues.push({
            type: 'FALLBACK_ID_OVERFLOW',
            severity: 'FAIL',
            count: fallbackIds.length,
            ids: fallbackIds.map(f => f.id),
            message: `🔴 ${fallbackIds.length} FALLBACK-IDs sueltos (máx=${MAX_FALLBACK_IDS}). OTT Navigator cuenta cada uno como stream variant → CRASH index error`
        });
    }
    return issues;
}

function validateProfileConsistency(entry) {
    const issues = [];
    if (!entry.profile) return issues;
    const expectedRes = PROFILE_RESOLUTION_MAP[entry.profile];
    const expectedMaxBw = PROFILE_MAX_BANDWIDTH[entry.profile];

    for (const tag of entry.tags) {
        const resMatch = tag.line.match(/^#KODIPROP:inputstream\.adaptive\.max_resolution=(.+)$/);
        if (resMatch && expectedRes) {
            const expectedWidth = parseInt(expectedRes.split('x')[0]);
            const actualWidth = parseInt(resMatch[1].split('x')[0]);
            if (actualWidth > expectedWidth * 1.5) {
                issues.push({
                    type: 'PROFILE_RESOLUTION_MISMATCH', severity: 'WARN',
                    profile: entry.profile, expected: expectedRes, actual: resMatch[1],
                    message: `⚠️ Profile ${entry.profile} espera max ${expectedRes} pero KODIPROP dice ${resMatch[1]}`
                });
            }
        }
        const bwMatch = tag.line.match(/^#KODIPROP:inputstream\.adaptive\.max_bandwidth=(\d+)$/);
        if (bwMatch && expectedMaxBw) {
            const actualBw = parseInt(bwMatch[1]);
            if (actualBw > expectedMaxBw * 3) {
                issues.push({
                    type: 'PROFILE_BANDWIDTH_MISMATCH', severity: 'WARN',
                    profile: entry.profile, expected: expectedMaxBw, actual: actualBw,
                    message: `⚠️ Profile ${entry.profile} espera max ~${(expectedMaxBw / 1e6).toFixed(0)}Mbps pero KODIPROP dice ${(actualBw / 1e6).toFixed(0)}Mbps`
                });
            }
        }
    }
    return issues;
}

function validateUnicodePipes(entry) {
    const issues = [];
    if (entry.extinf.includes('\u2503')) {
        issues.push({
            type: 'UNICODE_PIPE', severity: 'FAIL',
            message: `🔴 EXTINF contiene ┃ (U+2503). Debe ser | (U+007C). Causa "grupo fantasma" en TiviVision.`
        });
    }
    return issues;
}

function validateStructure(entry) {
    const issues = [];
    if (entry.tags.length > MAX_LINES_PER_CHANNEL) {
        issues.push({
            type: 'DEPTH_OVERFLOW', severity: 'FAIL',
            depth: entry.tags.length,
            message: `🔴 ${entry.tags.length} líneas entre EXTINF y URL (máx=${MAX_LINES_PER_CHANNEL}).`
        });
    }
    if (!entry.url) {
        issues.push({ type: 'MISSING_URL', severity: 'FAIL', message: `🔴 Canal sin URL final.` });
    } else if (entry.url.includes('placeholder.stream')) {
        issues.push({ type: 'PLACEHOLDER_URL', severity: 'WARN', message: `⚠️ URL placeholder: ${entry.url}` });
    }
    return issues;
}

// ─────────────────────────────────────────
// ORQUESTADOR
// ─────────────────────────────────────────

function auditChannel(entry, index) {
    const allIssues = [
        ...validateExtvlcopt(entry),
        ...validateKodiprop(entry),
        ...validateApeTags(entry),
        ...validateFallbackIds(entry),
        ...validateProfileConsistency(entry),
        ...validateUnicodePipes(entry),
        ...validateStructure(entry)
    ];

    // Solo contar FAIL y WARN para veredicto (INFO no cuenta)
    const hasFail = allIssues.some(i => i.severity === 'FAIL');
    const hasWarn = allIssues.some(i => i.severity === 'WARN');
    const verdict = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';

    return {
        index, name: entry.name || `Canal ${index}`,
        profile: entry.profile || 'UNKNOWN',
        lineNumber: entry.lineNumber,
        tagCount: entry.tags.length,
        hasUrl: !!entry.url,
        verdict,
        issues: allIssues.filter(i => i.severity !== 'INFO') // Solo FAIL y WARN en el report
    };
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

function main() {
    let inputFile = process.argv[2];
    let content;

    if (!inputFile || inputFile === '--stdin') {
        content = fs.readFileSync(0, 'utf8');
        inputFile = 'stdin';
    } else {
        if (!fs.existsSync(inputFile)) {
            console.error(`❌ Archivo no encontrado: ${inputFile}`);
            process.exit(1);
        }
        content = fs.readFileSync(inputFile, 'utf8');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔬 M3U8 UNIVERSAL COMPAT VALIDATOR v6.1 + RULES ENGINE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📄 Archivo: ${inputFile}`);
    console.log(`📏 Tamaño: ${(content.length / 1024).toFixed(1)} KB`);

    const entries = parseChannelEntries(content);
    console.log(`📺 Canales: ${entries.length}`);
    console.log('');

    // Imprimir reglas activas
    const totalRules = Object.keys(VLC_RULES).length + Object.keys(APE_RULES).length + Object.keys(KODI_RULES).length;
    console.log(`📋 Reglas activas: ${totalRules} (VLC:${Object.keys(VLC_RULES).length} APE:${Object.keys(APE_RULES).length} KODI:${Object.keys(KODI_RULES).length})`);
    console.log('   Políticas: NEVER_DOWN | NEVER_UP | EXACT_MATCH | UNIQUE | FREE');
    console.log('');

    let totalPass = 0, totalWarn = 0, totalFail = 0;
    const globalCounts = { vlc: 0, ape: 0, kodi: 0, fallback: 0, profile: 0, unicode: 0, structure: 0 };

    for (let i = 0; i < entries.length; i++) {
        const result = auditChannel(entries[i], i);
        if (result.verdict === 'PASS') totalPass++;
        else if (result.verdict === 'WARN') totalWarn++;
        else totalFail++;

        for (const issue of result.issues) {
            if (issue.type.startsWith('EXTVLCOPT')) globalCounts.vlc++;
            else if (issue.type.startsWith('APE')) globalCounts.ape++;
            else if (issue.type.startsWith('KODIPROP')) globalCounts.kodi++;
            else if (issue.type.startsWith('FALLBACK')) globalCounts.fallback++;
            else if (issue.type.startsWith('PROFILE')) globalCounts.profile++;
            else if (issue.type === 'UNICODE_PIPE') globalCounts.unicode++;
            else globalCounts.structure++;
        }

        if (result.verdict !== 'PASS') {
            const icon = result.verdict === 'FAIL' ? '🔴' : '🟡';
            console.log(`${icon} [${result.verdict}] Canal ${i}: ${result.name} (${result.profile}, ${result.tagCount} tags)`);
            for (const issue of result.issues) {
                console.log(`   ${issue.message}`);
            }
            console.log('');
        }
    }

    // Si todo pasa, mostrar los primeros 3 canales como ejemplo
    if (totalFail === 0 && entries.length > 0) {
        const sample = entries.slice(0, Math.min(3, entries.length));
        console.log('📺 Muestra de canales (primeros 3):');
        for (const e of sample) {
            console.log(`   ✅ ${e.name} (${e.profile}, ${e.tags.length} tags)`);
        }
        console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📊 RESUMEN GLOBAL');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ PASS: ${totalPass}  🟡 WARN: ${totalWarn}  🔴 FAIL: ${totalFail}`);
    console.log('');
    console.log('  Issues por tipo:');
    console.log(`    EXTVLCOPT:    ${globalCounts.vlc}`);
    console.log(`    APE tags:     ${globalCounts.ape}`);
    console.log(`    KODIPROP:     ${globalCounts.kodi}`);
    console.log(`    FALLBACK-ID:  ${globalCounts.fallback}`);
    console.log(`    Profile:      ${globalCounts.profile}`);
    console.log(`    Unicode ┃:    ${globalCounts.unicode}`);
    console.log(`    Estructura:   ${globalCounts.structure}`);

    const gv = totalFail > 0 ? 'FAIL' : totalWarn > 0 ? 'WARN' : 'PASS';
    const gi = gv === 'PASS' ? '✅' : gv === 'WARN' ? '🟡' : '🔴';
    console.log('');
    console.log(`  ${gi} VEREDICTO GLOBAL: ${gv}`);
    console.log('═══════════════════════════════════════════════════════════');

    // Guardar JSON
    const outputFile = inputFile === 'stdin' ? 'validation_report.json' : inputFile.replace(/\.m3u8?$/, '_validation.json');
    const report = {
        file: inputFile, timestamp: new Date().toISOString(),
        validatorVersion: '6.1-RULES-ENGINE',
        totalRules, totalChannels: entries.length,
        pass: totalPass, warn: totalWarn, fail: totalFail,
        globalVerdict: gv, globalCounts,
        channels: entries.map((e, i) => auditChannel(e, i)).filter(r => r.verdict !== 'PASS')
    };
    try {
        fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
        console.log(`\n📋 Reporte: ${outputFile}`);
    } catch (e) {
        console.log(`\n⚠️ No se pudo guardar: ${e.message}`);
    }

    process.exit(totalFail > 0 ? 1 : 0);
}

main();
