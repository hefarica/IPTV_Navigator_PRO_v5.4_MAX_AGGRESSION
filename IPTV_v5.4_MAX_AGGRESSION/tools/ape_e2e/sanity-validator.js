/**
 * APE Header Validator E2E — Módulo 3: Validador de Invariantes
 * =============================================================
 * Ejecuta los 9 invariantes del APE_SanityCheck sobre los headers
 * REALES capturados por el servidor de captura, y los compara contra
 * los headers DECLARADOS por el generador en #EXTHTTP.
 *
 * Invariantes (derivados del commit 6508821 + Plan de Acción P0-P3):
 *   I1  — Tamaño real del payload de headers <= 8192 bytes
 *   I2  — Referer no expone dominio VPS (es un dominio del pool neutro)
 *   I3  — Origin no expone dominio VPS
 *   I4  — Sec-CH-UA versión coincide con versión Chrome del User-Agent
 *   I5  — traceparent AUSENTE
 *   I6  — X-Auth-Type no contiene la cadena "OMEGA"
 *   I7  — X-Device-Capabilities coherente con el perfil del canal
 *   I8  — X-Requested-With AUSENTE
 *   I9  — X-Client-Version no contiene "OMEGA" ni "CRYSTAL" ni "APE-ULTIMATE"
 *
 * Invariantes adicionales E2E (no cubiertos por el SanityCheck estático):
 *   I10 — Headers declarados en #EXTHTTP están presentes en la petición real
 *   I11 — No hay headers extra en la petición real que no estén en #EXTHTTP
 *   I12 — El User-Agent real coincide con el User-Agent declarado
 */

'use strict';

// Pool de dominios neutros válidos para Referer/Origin (DEBE coincidir con _NEUTRAL_REFERER_POOL en m3u8-typed-arrays-ultimate.js)
// FIX C2 (commit 037e6cf): expandido de 15 → 20 dominios. Actualizado 2026-05-22.
const NEUTRAL_REFERER_POOL = [
  'https://www.google.com',
  'https://www.google.com/',
  'https://www.bing.com',
  'https://www.bing.com/',
  'https://search.yahoo.com',
  'https://www.duckduckgo.com',
  'https://www.youtube.com',
  'https://www.twitch.tv',
  'https://www.reddit.com',
  'https://www.wikipedia.org',
  'https://www.amazon.com',
  'https://www.netflix.com',
  'https://www.cloudflare.com',
  'https://www.akamai.com',
  'https://www.fastly.com',
  // Los 5 dominios añadidos en commit 037e6cf (C2 enhanced — doble rotación epochSeed)
  'https://www.apple.com',
  'https://www.microsoft.com',
  'https://www.github.com',
  'https://www.imdb.com',
  'https://www.cnn.com',
  'https://www.bbc.com',
  'https://www.espn.com'
];

// Headers que los reproductores/proxies suelen añadir automáticamente (no son del generador)
const PLAYER_INJECTED_HEADERS = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate'
]);

/**
 * Extrae la versión de Chrome de un User-Agent string.
 * @param {string} ua
 * @returns {string|null}
 */
function extractChromeVersion(ua) {
  if (!ua) return null;
  const m = ua.match(/Chrome\/(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Extrae la versión declarada en Sec-CH-UA.
 * Formato: "Google Chrome";v="123","Chromium";v="123","Not A;Brand";v="8"
 * @param {string} secChUa
 * @returns {string|null}
 */
function extractSecChUaVersion(secChUa) {
  if (!secChUa) return null;
  const m = secChUa.match(/(?:Google Chrome|Chromium)";v="(\d+)/i);
  return m ? m[1] : null;
}

function _looksLikeVpsDomain(url) {
  return /iptv-ape|duckdns|178\.156|hetzner/i.test(url || '');
}

/**
 * Ejecuta todos los invariantes sobre un canal.
 * @param {object} channel   - Objeto del parser M3U8 (headers declarados)
 * @param {object} captured  - Objeto del servidor de captura (headers reales)
 * @returns {ValidationResult}
 */
function validateChannel(channel, captured) {
  const declared = channel.exthttp || {};
  const real     = captured ? captured.headersMap : {};
  const results  = [];

  // ─── I1: Tamaño real del payload ────────────────────────────────────────────
  const realPayloadSize = captured ? captured.payloadSize : 0;
  results.push({
    id      : 'I1',
    name    : 'Tamaño real de headers <= 8192 bytes',
    pass    : realPayloadSize <= 8192,
    detail  : `Tamaño real: ${realPayloadSize} bytes (cap: 8192)`,
    severity: 'P0'
  });

  // ─── I2: Referer no expone dominio VPS ──────────────────────────────────────
  const realReferer = real['referer'] || real['Referer'] || '';
  const refererOk   = NEUTRAL_REFERER_POOL.some(d => realReferer.startsWith(d));
  const refererHasVps = _looksLikeVpsDomain(realReferer);
  results.push({
    id      : 'I2',
    name    : 'Referer es dominio neutro (no VPS)',
    pass    : refererOk && !refererHasVps,
    detail  : `Referer real: "${realReferer}"`,
    severity: 'P0'
  });

  // ─── I3: Origin no expone dominio VPS ───────────────────────────────────────
  const realOrigin = real['origin'] || real['Origin'] || '';
  const originOk   = !realOrigin || NEUTRAL_REFERER_POOL.some(d => realOrigin.startsWith(d));
  const originHasVps = _looksLikeVpsDomain(realOrigin);
  results.push({
    id      : 'I3',
    name    : 'Origin es dominio neutro (no VPS)',
    pass    : originOk && !originHasVps,
    detail  : `Origin real: "${realOrigin}"`,
    severity: 'P0'
  });

  // ─── I4: Sec-CH-UA versión == versión Chrome del UA ─────────────────────────
  const realUA         = real['user-agent'] || real['User-Agent'] || '';
  const realSecChUa    = real['sec-ch-ua']  || real['Sec-CH-UA']  || '';
  const uaVersion      = extractChromeVersion(realUA);
  const secChUaVersion = extractSecChUaVersion(realSecChUa);
  const i4Pass = !realSecChUa || (uaVersion && secChUaVersion && uaVersion === secChUaVersion);
  results.push({
    id      : 'I4',
    name    : 'Sec-CH-UA versión == versión Chrome del User-Agent',
    pass    : !!i4Pass,
    detail  : `UA version: ${uaVersion || 'N/A'} | Sec-CH-UA version: ${secChUaVersion || 'N/A'}`,
    severity: 'P0'
  });

  // ─── I5: traceparent AUSENTE ─────────────────────────────────────────────────
  const hasTraceparent = 'traceparent' in real || 'Traceparent' in real;
  results.push({
    id      : 'I5',
    name    : 'traceparent AUSENTE (bot signal WAF)',
    pass    : !hasTraceparent,
    detail  : hasTraceparent ? `traceparent encontrado: "${real['traceparent'] || real['Traceparent']}"` : 'OK — ausente',
    severity: 'P1'
  });

  // ─── I6: X-Auth-Type no contiene "OMEGA" ────────────────────────────────────
  const xAuthType = real['x-auth-type'] || real['X-Auth-Type'] || '';
  results.push({
    id      : 'I6',
    name    : 'X-Auth-Type no contiene "OMEGA"',
    pass    : !xAuthType.toUpperCase().includes('OMEGA'),
    detail  : `X-Auth-Type real: "${xAuthType}"`,
    severity: 'P1'
  });

  // ─── I7: X-Device-Capabilities coherente con perfil ─────────────────────────
  const xDevCap = real['x-device-capabilities'] || real['X-Device-Capabilities'] || '';
  const tier    = channel.tier || 'UNKNOWN';
  const isLowTier = ['P4', 'P5', 'SDR', 'BASIC'].some(t => tier.toUpperCase().includes(t));
  const hasPremiumCaps = /dolbyvision|4k|atmos/i.test(xDevCap);
  const i7Pass = !isLowTier || !hasPremiumCaps;
  results.push({
    id      : 'I7',
    name    : 'X-Device-Capabilities coherente con perfil del canal',
    pass    : i7Pass,
    detail  : `Tier: ${tier} | X-Device-Capabilities: "${xDevCap.substring(0, 80)}"`,
    severity: 'P1'
  });

  // ─── I8: X-Requested-With AUSENTE ───────────────────────────────────────────
  const hasXRW = 'x-requested-with' in real || 'X-Requested-With' in real;
  results.push({
    id      : 'I8',
    name    : 'X-Requested-With AUSENTE (incoherencia player nativo)',
    pass    : !hasXRW,
    detail  : hasXRW ? `X-Requested-With encontrado: "${real['x-requested-with'] || real['X-Requested-With']}"` : 'OK — ausente',
    severity: 'P2'
  });

  // ─── I9: X-Client-Version no contiene fingerprints ──────────────────────────
  const xClientVer = real['x-client-version'] || real['X-Client-Version'] || '';
  const i9Fail = /OMEGA|CRYSTAL|APE.ULTIMATE|APE_ULTIMATE/i.test(xClientVer);
  results.push({
    id      : 'I9',
    name    : 'X-Client-Version sin fingerprints del engine',
    pass    : !i9Fail,
    detail  : `X-Client-Version real: "${xClientVer}"`,
    severity: 'P1'
  });

  // ─── I10: Headers declarados presentes en petición real ─────────────────────
  const missingInReal = [];
  for (const [key] of Object.entries(declared)) {
    const keyLower = key.toLowerCase();
    if (PLAYER_INJECTED_HEADERS.has(keyLower)) continue;
    if (!(keyLower in real) && !(key in real)) {
      missingInReal.push(key);
    }
  }
  results.push({
    id      : 'I10',
    name    : 'Headers declarados en #EXTHTTP presentes en petición real',
    pass    : missingInReal.length === 0,
    detail  : missingInReal.length > 0
      ? `Faltantes en petición real: ${missingInReal.slice(0, 5).join(', ')}${missingInReal.length > 5 ? ` (+${missingInReal.length - 5} más)` : ''}`
      : `OK — todos los ${Object.keys(declared).length} headers declarados presentes`,
    severity: 'P0'
  });

  // ─── I11: No hay headers extra no declarados (excepto los del player) ────────
  const extraInReal = [];
  for (const key of Object.keys(real)) {
    const keyLower = key.toLowerCase();
    if (PLAYER_INJECTED_HEADERS.has(keyLower)) continue;
    const inDeclared = Object.keys(declared).some(k => k.toLowerCase() === keyLower);
    if (!inDeclared) {
      extraInReal.push(key);
    }
  }
  results.push({
    id      : 'I11',
    name    : 'Sin headers extra inyectados por el reproductor',
    pass    : extraInReal.length === 0,
    detail  : extraInReal.length > 0
      ? `Headers extra no declarados: ${extraInReal.slice(0, 5).join(', ')}${extraInReal.length > 5 ? ` (+${extraInReal.length - 5} más)` : ''}`
      : 'OK — sin headers extra',
    severity: 'P1'
  });

  // ─── I12: User-Agent real == User-Agent declarado ────────────────────────────
  const declaredUA = declared['User-Agent'] || declared['user-agent'] || '';
  const i12Pass    = !declaredUA || (realUA === declaredUA);
  results.push({
    id      : 'I12',
    name    : 'User-Agent real == User-Agent declarado (idempotencia)',
    pass    : i12Pass,
    detail  : i12Pass
      ? `OK — UA coincide: "${realUA.substring(0, 60)}..."`
      : `MISMATCH\n  Declarado: "${declaredUA.substring(0, 60)}"\n  Real:      "${realUA.substring(0, 60)}"`,
    severity: 'P0'
  });

  const passed   = results.filter(r => r.pass).length;
  const failed   = results.filter(r => !r.pass).length;
  const p0Fails  = results.filter(r => !r.pass && r.severity === 'P0').length;

  return {
    channelIndex : channel.index,
    channelName  : channel.name,
    tier         : channel.tier,
    totalChecks  : results.length,
    passed,
    failed,
    p0Fails,
    score        : Math.round((passed / results.length) * 100),
    status       : p0Fails > 0 ? 'CRITICAL_FAIL' : (failed > 0 ? 'FAIL_WARN' : 'PASS'),
    checks       : results
  };
}

module.exports = { validateChannel };
