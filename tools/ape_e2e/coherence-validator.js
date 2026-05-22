/**
 * APE Coherence Validator
 * =======================
 * Valida la coherencia interna entre los 4 headers de identidad de cada canal:
 *   - User-Agent
 *   - X-Session-Id
 *   - X-Request-Id
 *   - Referer
 *
 * Reglas de coherencia validadas:
 *   R1  — UA presente y no vacío
 *   R2  — X-Session-Id tiene formato <hex16>_<alnum12>
 *   R3  — X-Request-Id es prefijo del segmento canal de X-Session-Id
 *   R4  — X-Request-Id ≠ X-Session-Id (no son idénticos)
 *   R5  — Referer es HTTPS y dominio conocido del pool neutro
 *   R6  — Origin == Referer sin trailing slash
 *   R7  — Versión Chrome en UA coincide con versión en Sec-CH-UA (si presente)
 *   R8  — X-Session-Id es único entre todos los canales (no hay colisiones)
 *   R9  — X-Request-Id es único entre todos los canales (no hay colisiones)
 *   R10 — UA no es un string de curl, wget o libVLC hardcodeado
 *   R11 — Referer no expone ningún dominio VPS o IP privada
 *   R12 — Los 4 headers coexisten en el mismo bloque #EXTHTTP
 *
 * Uso: node coherence-validator.js <m3u8_path> [--max N] [--report output.md]
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const m3u8Path  = args[0];
const maxIdx    = args.indexOf('--max');
const MAX       = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 20;
const repIdx    = args.indexOf('--report');
const REPORT    = repIdx !== -1 ? args[repIdx + 1] : 'APE_Coherence_Report.md';

if (!m3u8Path || !fs.existsSync(m3u8Path)) {
  console.error(`Uso: node coherence-validator.js <m3u8_path> [--max N] [--report output.md]`);
  process.exit(1);
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const NEUTRAL_REFERER_POOL = new Set([
  'www.google.com', 'www.bing.com', 'search.yahoo.com', 'www.duckduckgo.com',
  'www.youtube.com', 'www.twitch.tv', 'www.reddit.com', 'www.wikipedia.org',
  'www.amazon.com', 'www.netflix.com', 'www.cloudflare.com', 'www.akamai.com',
  'www.fastly.com', 'www.apple.com', 'www.microsoft.com', 'www.github.com',
  'www.imdb.com', 'www.cnn.com', 'www.bbc.com', 'www.espn.com'
]);

const TOXIC_UA_PATTERNS = [
  /^curl\//i,
  /^wget\//i,
  /libvlc\/3\.0\.(1[0-5]|[0-9])\b/i,   // libVLC < 3.0.16 (hardcoded legacy)
  /^python-requests/i,
  /^okhttp\/[0-3]\./i,
  /^Go-http-client/i
];

const SESSION_ID_REGEX   = /^[0-9a-f]{16}_[0-9a-z]{10,14}$/i;
const REQUEST_ID_REGEX   = /^[0-9a-z]{10,16}$/i;
const CHROME_VER_IN_UA   = /Chrome\/(\d+)\./;
const SEC_CH_UA_VER      = /[";]v="(\d+)"/;

// ─── PARSER (reutiliza lógica del m3u8-parser.js del E2E) ────────────────────
function parseChannels(m3u8Path, maxChannels) {
  const linesToRead = maxChannels * 500;
  const content = execSync(
    `head -n ${linesToRead} "${m3u8Path}"`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );

  const blocks   = content.split('#EXTINF');
  const channels = [];

  for (let i = 1; i < blocks.length && channels.length < maxChannels; i++) {
    const lines   = ('#EXTINF' + blocks[i]).split('\n').map(l => l.trim()).filter(Boolean);
    const extinf  = lines[0];
    const channel = {
      index   : channels.length,
      name    : (extinf.match(/tvg-name="([^"]*)"/) || [])[1] || `Canal-${channels.length}`,
      exthttp : null,
      url     : null
    };

    let acc = '', inHttp = false;

    for (let j = 1; j < lines.length; j++) {
      const l = lines[j];
      if (inHttp) {
        if (l.startsWith('#') || l.startsWith('http')) {
          inHttp = false;
          try { channel.exthttp = JSON.parse(decodeURIComponent(acc.trim())); }
          catch { try { channel.exthttp = JSON.parse(acc.trim()); } catch { channel.exthttp = {}; } }
          j--;
        } else { acc += l; }
        continue;
      }
      if (l.startsWith('#EXTHTTP:'))      { inHttp = true; acc = l.replace('#EXTHTTP:', '').trim(); }
      else if (l && !l.startsWith('#'))   { channel.url = l; break; }
    }

    if (channel.url && channel.exthttp) channels.push(channel);
  }
  return channels;
}

// ─── REGLAS DE COHERENCIA ────────────────────────────────────────────────────
function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function checkCoherence(channel, sessionIds, requestIds) {
  const h   = channel.exthttp;
  const ua  = h['User-Agent'] || h['user-agent'] || '';
  const sid = h['X-Session-Id'] || h['x-session-id'] || '';
  const rid = h['X-Request-Id'] || h['x-request-id'] || '';
  const ref = h['Referer']      || h['referer']      || '';
  const ori = h['Origin']       || h['origin']       || '';
  const sch = h['Sec-CH-UA']    || h['sec-ch-ua']    || '';

  const checks = [];

  // R1 — UA presente y no vacío
  checks.push({
    id: 'R1', name: 'User-Agent presente y no vacío',
    pass: ua.length > 0,
    detail: ua.length > 0 ? `UA: "${ua.substring(0, 60)}..."` : 'AUSENTE'
  });

  // R2 — X-Session-Id tiene formato <hex16>_<alnum12>
  const r2 = SESSION_ID_REGEX.test(sid);
  checks.push({
    id: 'R2', name: 'X-Session-Id formato <hex16>_<alnum12>',
    pass: r2,
    detail: r2 ? `OK: "${sid}"` : `Formato inválido: "${sid}"`
  });

  // R3 — X-Request-Id es prefijo del segmento canal de X-Session-Id
  const sidParts   = sid.split('_');
  const sidChannel = sidParts[1] || '';
  const r3 = rid.length > 0 && sidChannel.startsWith(rid.substring(0, Math.min(rid.length, 10)));
  checks.push({
    id: 'R3', name: 'X-Request-Id es prefijo del segmento canal de X-Session-Id',
    pass: r3,
    detail: r3
      ? `OK — RID "${rid}" ⊂ SID canal "${sidChannel}"`
      : `Mismatch — RID: "${rid}" vs SID canal: "${sidChannel}"`
  });

  // R4 — X-Request-Id ≠ X-Session-Id
  checks.push({
    id: 'R4', name: 'X-Request-Id ≠ X-Session-Id (no son idénticos)',
    pass: rid !== sid,
    detail: rid !== sid ? 'OK — son distintos' : 'FALLO — son idénticos (posible hardcode)'
  });

  // R5 — Referer es HTTPS y dominio del pool neutro
  const refDomain = extractDomain(ref);
  const r5a = ref.startsWith('https://');
  const r5b = NEUTRAL_REFERER_POOL.has(refDomain);
  checks.push({
    id: 'R5', name: 'Referer es HTTPS y dominio del pool neutro (20 dominios)',
    pass: r5a && r5b,
    detail: (r5a && r5b)
      ? `OK — "${refDomain}"`
      : `${!r5a ? 'No HTTPS' : ''} ${!r5b ? `Dominio fuera del pool: "${refDomain}"` : ''}`
  });

  // R6 — Origin == Referer sin trailing slash
  const refNoSlash = ref.replace(/\/$/, '');
  checks.push({
    id: 'R6', name: 'Origin == Referer sin trailing slash',
    pass: ori === refNoSlash,
    detail: ori === refNoSlash
      ? `OK — "${ori}"`
      : `Mismatch — Origin: "${ori}" vs Referer: "${refNoSlash}"`
  });

  // R7 — Versión Chrome en UA coincide con Sec-CH-UA (si presente)
  const uaVer  = (ua.match(CHROME_VER_IN_UA)  || [])[1];
  const schVer = (sch.match(SEC_CH_UA_VER)     || [])[1];
  const r7 = !schVer || uaVer === schVer;
  checks.push({
    id: 'R7', name: 'Versión Chrome en UA == versión en Sec-CH-UA',
    pass: r7,
    detail: !schVer
      ? `Sec-CH-UA ausente (no requerido)`
      : r7
        ? `OK — ambos v${uaVer}`
        : `Mismatch — UA v${uaVer} vs Sec-CH-UA v${schVer}`
  });

  // R8 — X-Session-Id único (verificado externamente con Set)
  const r8 = !sessionIds.has(sid);
  if (r8) sessionIds.add(sid);
  checks.push({
    id: 'R8', name: 'X-Session-Id único entre todos los canales',
    pass: r8,
    detail: r8 ? `OK — "${sid}"` : `COLISIÓN detectada — "${sid}" ya existe en otro canal`
  });

  // R9 — X-Request-Id único
  const r9 = !requestIds.has(rid);
  if (r9) requestIds.add(rid);
  checks.push({
    id: 'R9', name: 'X-Request-Id único entre todos los canales',
    pass: r9,
    detail: r9 ? `OK — "${rid}"` : `COLISIÓN detectada — "${rid}" ya existe en otro canal`
  });

  // R10 — UA no es un string tóxico hardcodeado
  const r10 = !TOXIC_UA_PATTERNS.some(p => p.test(ua));
  checks.push({
    id: 'R10', name: 'UA no es curl/wget/libVLC legacy/python-requests',
    pass: r10,
    detail: r10 ? `OK — "${ua.substring(0, 50)}..."` : `UA TÓXICO detectado: "${ua}"`
  });

  // R11 — Referer no expone IP privada ni dominio VPS
  const r11 = !/(\b10\.\d+\.\d+\.\d+|\b192\.168\.\d+\.\d+|\b172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|localhost|\.local\b|vps|server|host\d+)/i.test(ref);
  checks.push({
    id: 'R11', name: 'Referer no expone IP privada ni dominio VPS',
    pass: r11,
    detail: r11 ? `OK — "${refDomain}"` : `EXPOSICIÓN VPS detectada en Referer: "${ref}"`
  });

  // R12 — Los 4 headers coexisten en el mismo bloque #EXTHTTP
  const r12 = ua && sid && rid && ref;
  checks.push({
    id: 'R12', name: 'UA + X-Session-Id + X-Request-Id + Referer coexisten en #EXTHTTP',
    pass: !!r12,
    detail: r12
      ? 'OK — los 4 headers presentes'
      : `Faltantes: ${[!ua && 'UA', !sid && 'X-Session-Id', !rid && 'X-Request-Id', !ref && 'Referer'].filter(Boolean).join(', ')}`
  });

  const passed  = checks.filter(c => c.pass).length;
  const failed  = checks.filter(c => !c.pass).length;
  const p0Fails = checks.filter(c => !c.pass && ['R1','R5','R8','R9','R11'].includes(c.id)).length;

  return {
    checks,
    passed,
    failed,
    p0Fails,
    score  : Math.round((passed / checks.length) * 100),
    status : p0Fails > 0 ? 'CRITICAL' : failed > 0 ? 'WARN' : 'PASS'
  };
}

// ─── REPORTE ─────────────────────────────────────────────────────────────────
function buildReport(channels, results) {
  let md = `# Reporte de Coherencia de Headers — APE Coherence Validator\n\n`;
  md += `**Fecha:** ${new Date().toISOString()}\n`;
  md += `**Archivo:** \`${path.basename(m3u8Path)}\`\n`;
  md += `**Canales analizados:** ${channels.length}\n\n`;
  md += `---\n\n`;

  let totalPass = 0, totalFail = 0, totalCritical = 0;

  channels.forEach((ch, i) => {
    const r = results[i];
    totalPass     += r.passed;
    totalFail     += r.failed;
    totalCritical += r.p0Fails;

    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '🔴';
    md += `## Canal ${ch.index}: ${ch.name}\n`;
    md += `- **Status:** ${icon} ${r.status} — Score: **${r.score}%**\n\n`;
    md += `| ID | Regla | Resultado | Detalle |\n`;
    md += `|---|---|---|---|\n`;
    r.checks.forEach(c => {
      const ci = c.pass ? '✅' : ['R1','R5','R8','R9','R11'].includes(c.id) ? '🔴' : '⚠️';
      md += `| ${c.id} | ${c.name} | ${ci} | ${c.detail} |\n`;
    });
    md += `\n`;
  });

  md += `---\n\n## Resumen Global\n\n`;
  md += `| Métrica | Valor |\n|---|---|\n`;
  md += `| Canales analizados | ${channels.length} |\n`;
  md += `| Reglas aprobadas | ${totalPass} |\n`;
  md += `| Reglas fallidas | ${totalFail} |\n`;
  md += `| Fallos críticos (P0) | ${totalCritical} |\n`;
  md += `| Score global | ${Math.round((totalPass / (totalPass + totalFail)) * 100)}% |\n\n`;

  if (totalCritical > 0) {
    md += `> **🔴 ALERTA CRÍTICA:** Se detectaron ${totalCritical} fallos P0. Los headers de identidad son incoherentes o exponen información sensible. Revisar inmediatamente antes de distribuir la lista.\n`;
  } else if (totalFail > 0) {
    md += `> **⚠️ ADVERTENCIA:** Se detectaron ${totalFail} fallos no críticos. La lista es funcional pero tiene inconsistencias menores que podrían ser detectadas por WAFs avanzados.\n`;
  } else {
    md += `> **✅ COHERENCIA TOTAL:** Los 4 headers de identidad son internamente coherentes en todos los canales analizados. El perfil de identidad es indistinguible de tráfico legítimo.\n`;
  }

  return md;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log(`[APE Coherence Validator]`);
console.log(`Archivo  : ${m3u8Path}`);
console.log(`Canales  : hasta ${MAX}`);
console.log(`Reporte  : ${REPORT}\n`);

console.log(`[1/3] Parseando M3U8...`);
const channels = parseChannels(m3u8Path, MAX);
console.log(`      ${channels.length} canales con #EXTHTTP extraídos.\n`);

if (channels.length === 0) {
  console.error('Error: No se encontraron canales con bloques #EXTHTTP.');
  process.exit(1);
}

console.log(`[2/3] Validando coherencia de headers (12 reglas por canal)...`);
const sessionIds = new Set();
const requestIds = new Set();
const results    = channels.map(ch => checkCoherence(ch, sessionIds, requestIds));

const totalPass     = results.reduce((s, r) => s + r.passed, 0);
const totalFail     = results.reduce((s, r) => s + r.failed, 0);
const totalCritical = results.reduce((s, r) => s + r.p0Fails, 0);
const globalScore   = Math.round((totalPass / (totalPass + totalFail)) * 100);

console.log(`      Reglas aprobadas  : ${totalPass}`);
console.log(`      Reglas fallidas   : ${totalFail}`);
console.log(`      Fallos críticos   : ${totalCritical}`);
console.log(`      Score global      : ${globalScore}%\n`);

console.log(`[3/3] Generando reporte...`);
const report = buildReport(channels, results);
fs.writeFileSync(REPORT, report);
console.log(`      Reporte guardado en: ${REPORT}\n`);

if (totalCritical > 0) {
  console.log(`🔴 RESULTADO: CRITICAL — ${totalCritical} fallos P0 detectados.`);
  process.exit(2);
} else if (totalFail > 0) {
  console.log(`⚠️  RESULTADO: WARN — ${totalFail} fallos no críticos.`);
  process.exit(1);
} else {
  console.log(`✅ RESULTADO: PASS — Coherencia total en ${channels.length} canales.`);
  process.exit(0);
}
