// ═══════════════════════════════════════════════════════════════
// AUDITORÍA FORENSE DE CREDENCIALES — Lista M3U8
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = process.env.TEMP + '\\ape_lista_audit.m3u8';

console.log('Cargando lista...');
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
console.log(`Total líneas: ${lines.length}`);

// ── Extraer TODAS las URLs ──
const urls = lines.filter(l => l.startsWith('http://') || l.startsWith('https://'));
console.log(`\nTotal URLs: ${urls.length}`);

// ── Analizar estructura de URLs ──
const urlPatterns = {};
const credentialIssues = [];
const emptyUrls = [];
const serverMap = {};
let urlsWithCreds = 0;
let urlsWithoutCreds = 0;
let urlsM3u8 = 0;
let urlsTs = 0;
let urlsOther = 0;

urls.forEach((url, i) => {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const pathParts = u.pathname.split('/').filter(Boolean);
    
    // Contar por host
    serverMap[host] = (serverMap[host] || 0) + 1;
    
    // Detectar patrón de URL
    if (pathParts.length >= 4 && (pathParts[0] === 'live' || pathParts[0] === 'movie' || pathParts[0] === 'series')) {
      // Xtream pattern: /live/user/pass/id.ext
      urlsWithCreds++;
      const user = pathParts[1];
      const pass = pathParts[2];
      const streamPart = pathParts[3];
      
      // Detectar credenciales vacías o sospechosas
      if (!user || user === 'undefined' || user === 'null') {
        credentialIssues.push({ line: i, url: url.substring(0, 80), issue: 'USERNAME vacío/undefined' });
      }
      if (!pass || pass === 'undefined' || pass === 'null') {
        credentialIssues.push({ line: i, url: url.substring(0, 80), issue: 'PASSWORD vacío/undefined' });
      }
      if (!streamPart || streamPart === '0.m3u8' || streamPart === 'undefined.m3u8') {
        credentialIssues.push({ line: i, url: url.substring(0, 80), issue: 'STREAM_ID inválido' });
      }
      
      // Extensión
      const ext = streamPart.split('.').pop();
      if (ext === 'm3u8') urlsM3u8++;
      else if (ext === 'ts') urlsTs++;
      else urlsOther++;
      
      // Patrón
      const pattern = `${u.protocol}//{host}/${pathParts[0]}/{user}/{pass}/{id}.${ext}`;
      urlPatterns[pattern] = (urlPatterns[pattern] || 0) + 1;
      
    } else if (u.pathname.includes('/get.php') || u.pathname.includes('/player_api.php')) {
      // API pattern
      urlsWithCreds++;
      urlPatterns['API_PHP'] = (urlPatterns['API_PHP'] || 0) + 1;
    } else {
      urlsWithoutCreds++;
      urlPatterns['OTHER: ' + u.pathname.substring(0, 40)] = (urlPatterns['OTHER: ' + u.pathname.substring(0, 40)] || 0) + 1;
    }
    
  } catch(e) {
    credentialIssues.push({ line: i, url: url.substring(0, 60), issue: 'URL MALFORMADA: ' + e.message });
  }
});

// ── Ejemplo de URLs (primeras 5) ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  MUESTRA DE URLs (primeras 5 URLs)');
console.log('═══════════════════════════════════════════════════════════');
urls.slice(0, 5).forEach((u, i) => {
  // Enmascarar credenciales para output
  const masked = u.replace(/\/live\/([^/]+)\/([^/]+)\//, '/live/****/****/');
  console.log(`  ${i+1}. ${masked.substring(0, 120)}...`);
});

// ── Servidores detectados ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SERVIDORES DETECTADOS');
console.log('═══════════════════════════════════════════════════════════');
const sorted = Object.entries(serverMap).sort((a,b) => b[1] - a[1]);
sorted.forEach(([host, count]) => {
  console.log(`  ${count.toString().padStart(5)} canales → ${host}`);
});

// ── Patrones de URL ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PATRONES DE URL');
console.log('═══════════════════════════════════════════════════════════');
Object.entries(urlPatterns).sort((a,b) => b[1] - a[1]).forEach(([pattern, count]) => {
  console.log(`  ${count.toString().padStart(5)}× ${pattern}`);
});

// ── Extensiones ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  EXTENSIONES');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  .m3u8: ${urlsM3u8}`);
console.log(`  .ts:   ${urlsTs}`);
console.log(`  otros: ${urlsOther}`);
console.log(`  con credenciales: ${urlsWithCreds}`);
console.log(`  sin credenciales: ${urlsWithoutCreds}`);

// ── PROBLEMAS DE CREDENCIALES ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PROBLEMAS DE CREDENCIALES');
console.log('═══════════════════════════════════════════════════════════');
if (credentialIssues.length === 0) {
  console.log('  ✅ 0 problemas — todas las URLs tienen credenciales válidas');
} else {
  console.log(`  ❌ ${credentialIssues.length} PROBLEMAS ENCONTRADOS:`);
  credentialIssues.slice(0, 20).forEach(issue => {
    console.log(`     Línea ${issue.line}: ${issue.issue}`);
    console.log(`       ${issue.url}`);
  });
  if (credentialIssues.length > 20) {
    console.log(`  ... y ${credentialIssues.length - 20} más`);
  }
}

// ── Verificar URLs por canal (EXTINF → URL) ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  CONTEO URLs POR CANAL');
console.log('═══════════════════════════════════════════════════════════');
const extinfs = lines.filter(l => l.startsWith('#EXTINF:')).length;
console.log(`  #EXTINF: ${extinfs}`);
console.log(`  URLs:    ${urls.length}`);
const ratio = (urls.length / extinfs).toFixed(2);
console.log(`  Ratio URL/Canal: ${ratio}`);
if (Math.abs(parseFloat(ratio) - 1.0) < 0.05) {
  console.log('  ✅ ~1 URL por canal — CORRECTO');
} else {
  console.log(`  ❌ ${ratio} URLs por canal — PROBLEMA (debe ser ~1.0)`);
}

// ── Check EXT-X-MAP ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  EXT-X-MAP CHECK');
console.log('═══════════════════════════════════════════════════════════');
const maps = lines.filter(l => l.includes('#EXT-X-MAP:'));
console.log(`  Total EXT-X-MAP: ${maps.length}`);
if (maps.length > 0) {
  const sample = maps[0].substring(0, 120);
  console.log(`  Ejemplo: ${sample}...`);
  if (maps[0].includes('seg=init.mp4')) {
    console.log('  ✅ init.mp4 dinámico via resolver');
  } else if (maps[0].includes('URI="init.mp4"')) {
    console.log('  ❌ init.mp4 ESTÁTICO — causará 404');
  }
}

// ── STREAM-INF duplicados ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  STREAM-INF CHECK');
console.log('═══════════════════════════════════════════════════════════');
const streamInfs = lines.filter(l => l.startsWith('#EXT-X-STREAM-INF:'));
console.log(`  Total EXT-X-STREAM-INF: ${streamInfs.length}`);
console.log(`  Canales: ${extinfs}`);
const siRatio = (streamInfs.length / extinfs).toFixed(2);
console.log(`  Ratio STREAM-INF/Canal: ${siRatio}`);
if (parseFloat(siRatio) <= 1.1) {
  console.log('  ✅ 1 STREAM-INF por canal — CORRECTO');
} else {
  console.log(`  ❌ ${siRatio} STREAM-INF por canal — HAY DUPLICADOS`);
}

console.log('\n═══════════════════════════════════════════════════════════');
if (credentialIssues.length === 0 && Math.abs(parseFloat(ratio) - 1.0) < 0.05) {
  console.log('  🟢 LISTA CERTIFICADA — Credenciales OK, 1 URL/canal');
} else {
  console.log('  🔴 LISTA CON PROBLEMAS');
}
console.log('═══════════════════════════════════════════════════════════\n');
