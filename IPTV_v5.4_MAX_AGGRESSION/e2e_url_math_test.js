const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\HFRC\\Desktop\\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\\IPTV_v5.4_MAX_AGGRESSION\\frontend\\js\\ape-v9\\m3u8-typed-arrays-ultimate.js', 'utf8');

// We extract the _buildPerfectUrl and buildChannelUrl function to test it 
// We can use a simple eval to load it into global scope
let context = {};
function sanitizeCredential(c) { return c; }
function preferHttps(u) { return u.replace(/^http:/, 'https:'); }

// Eval the file content, ignoring UI specific code
try {
  eval(content);
} catch (e) {
  // It will throw because of browser variables like window, document. That's okay, we just want our functions if they got hoisted.
}

// Since buildChannelUrl might throw when window is missing, we'll manually extract the logic.
const mathParserCode = content.match(/\/\/ \=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=[\s\S]*?\/\/ El Orquestador Raíz/m)[0];

eval(`
${mathParserCode}

console.log('--- TEST: XTREAM HLS ---');
try {
   let xtreamUrl = _buildPerfectUrl({
      baseUrl: 'http://myprovider.com:8080',
      serverType: 'xtream',
      username: 'usr_ape',
      password: 'pwd_ape',
      streamId: '12345',
      extension: 'm3u8'
   });
   console.log('Xtream RESULT: ' + xtreamUrl);
} catch(e) { console.error('FAIL XTREAM', e); }

console.log('--- TEST: QUERY HLS ---');
try {
   let queryUrl = _buildPerfectUrl({
      baseUrl: 'http://line.ott.com',
      serverType: 'query_hls',
      endpointPath: '/player_api.php',
      username: 'user_X',
      password: 'user_Y',
      streamId: '999',
      extraParams: { someid: 'ABC' },
      extension: 'm3u8'
   });
   console.log('Query RESULT: ' + queryUrl);
} catch(e) { console.error('FAIL QUERY', e); }

console.log('--- TEST: DIRECT HLS ---');
try {
   let directUrl = _buildPerfectUrl({
      baseUrl: 'http://cdn1.tivi.net',
      serverType: 'direct_hls',
      directPath: '/live/chunklist_1920x1080.m3u8',
      extension: 'm3u8'
   });
   console.log('Direct RESULT: ' + directUrl);
} catch(e) { console.error('FAIL DIRECT', e); }
`);

