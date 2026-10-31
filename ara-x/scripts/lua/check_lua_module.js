'use strict';

/**
 * I3-LUA · checker estático del módulo Lua `/sync`, su snippet y el borde V3-R2.
 *
 * No hay Lua/nginx en el host: verifica patrones + paridad con el contrato D3 v2
 * (schema/cliente) y las reparaciones V3 F-03/04/05/06/07/08/10/11.
 *
 * Uso: node ara-x/scripts/lua/check_lua_module.js [repo-root] → exit 1 si falla.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));

const FILES = {
  module: 'ara-x/vps/lua/ara_x_sync.lua',
  readme: 'ara-x/vps/lua/README.md',
  fixture: 'ara-x/vps/lua/ara_x_sync.policy.example.json',
  snippet: 'ara-x/vps/nginx/ara-sync-lua.conf',
  phpSnippet: 'ara-x/vps/nginx/ara-sync.conf',
  zone: 'ara-x/vps/nginx/ara-sync-zone.conf',
  php: 'ara-x/vps/php/ara-sync.php',
  keysExample: 'ara-x/vps/php/config/ara-sync-keys.example.json',
  resSchema: 'ara-x/vps/schema/sync_response.schema.json',
  client: 'ara-x/vps/client/ara_sync_client.js'
};

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error('faltante: ' + rel);
  return fs.readFileSync(full, 'utf8');
}

function stripLuaComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function stripNginxComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function run() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail || '' });

  const rawModule = read(FILES.module);
  const moduleCode = stripLuaComments(rawModule);
  const rawSnippet = read(FILES.snippet);
  const snippetCode = stripNginxComments(rawSnippet);
  const phpSnippet = stripNginxComments(read(FILES.phpSnippet));
  const zone = read(FILES.zone);
  const zoneCode = stripNginxComments(zone);
  const php = read(FILES.php);
  const readme = read(FILES.readme);
  const fixture = JSON.parse(read(FILES.fixture));
  const schema = JSON.parse(read(FILES.resSchema));
  const client = require(path.join(ROOT, FILES.client));

  // 1 · V3-F-03 / F-04 / F-11: el módulo no carga helpers con side effects ni
  //     añade campos extra a la política ni inyecta JSON de shared.
  const forbidden = [
    { name: 'require (F-03)', re: /\brequire\s*\(/ },
    { name: 'ape_attr (F-03)', re: /ape_attr/i, scope: moduleCode },
    { name: 'M.serve (F-03)', re: /M\.serve/ },
    { name: 'resty', re: /resty/i },
    { name: 'content_by_lua', re: /content_by_lua/i },
    { name: 'EXT-X-VERSION:6', re: /EXT-X-VERSION:6/ },
    { name: 'MAX-RESOLUTION:7680', re: /MAX-RESOLUTION:7680/ },
    { name: 'allow_8k', re: /allow_8k/i },
    { name: '7680x4320', re: /7680x4320/ },
    { name: 'fallback P3', re: /\bP3\b/ },
    { name: 'fallback P4', re: /\bP4\b/ },
    { name: 'proxy_pass', re: /proxy_pass/i },
    { name: 'fetch/http externo', re: /\b(fetch|http_get|httpc|socket)\b/i },
    { name: 'soc_canonical top-level (F-04)', re: /soc_canonical/ },
    { name: 'prov top-level (F-04)', re: /"prov"\s*:/ },
    { name: 'conf top-level (F-04)', re: /"conf"\s*:/ },
    { name: 'lab_content raw (F-11)', re: /lab_content/ },
    { name: 'content inyectado (F-11)', re: /"content"\s*:/ }
  ];
  for (const f of forbidden) {
    const haystack = f.scope || rawModule;
    add('módulo sin ' + f.name, !f.re.test(haystack), f.re.test(haystack) ? 'patrón presente' : '');
  }

  // 2 · HMAC/cripto embebida y contrato D3
  const required = [
    ['SHA-256 embebido (F-03)', /local function sha256\(/],
    ['HMAC embebido (F-03)', /local function hmac_sha256\(/],
    ['hex helper', /local function hex\(/],
    ['ngx.shared', /ngx\.shared/],
    ['shared dict ara_sync_lua', /ara_sync_lua/],
    ['límite 16 KB', /MAX_BODY\s*=\s*16384/],
    ['get_body_data', /ngx\.req\.get_body_data/],
    ['get_body_file', /ngx\.req\.get_body_file/],
    ['prefijo request D3', /ARA-X-SYNC-V1/],
    ['prefijo response D3', /ARA-X-SYNC-RESP-V1/],
    ['canonicalización request', /table\.concat\(\{\s*M\.REQ_PREFIX/],
    ['canonicalización response', /table\.concat\(\{\s*M\.RESP_PREFIX/],
    ['seq entero (F-10)', /local function jint\(/],
    ['scanner top-level (F-10)', /local function scan_top_keys\(/],
    ['allowlist top-level (F-10)', /local ALLOWED_TOP/],
    ['required top-level (F-10)', /local REQUIRED_TOP/],
    ['rechazo no entero (F-10)', /non_integer/],
    ['soc_raw obligatorio (F-10)', /soc_raw_required/],
    ['clave 0600 (F-05)', /KEY_PATH/],
    ['load_key aislado (F-03)', /local function load_key\(/],
    ['artifact_sha256', /artifact_sha256/],
    ['never_downscale', /never_downscale/],
    ['min_resolution', /min_resolution/],
    ['fps', /"fps"/],
    ['processing', /processing/],
    ['thermal', /thermal/],
    ['pcall', /pcall/],
    ['X-ARA-Sig', /X-ARA-Sig/],
    ['429', /429/],
    ['Retry-After (F-07)', /Retry-After/],
    ['401', /401/],
    ['409', /409/],
    ['413', /413/],
    ['503', /503/],
    ['NOT_RUN luac', /luac -p.*NOT_RUN|NOT_RUN.*luac -p/i],
    ['NOT_RUN nginx -t', /nginx -t.*NOT_RUN|NOT_RUN.*nginx -t/i]
  ];
  for (const [name, re] of required) add('módulo exige ' + name, re.test(rawModule));

  // 3 · V3-F-04: la política fixture (misma forma que emite Lua) pasa el validador real
  //     y usa EXACTAMENTE los campos del schema (sin extras top-level).
  const schemaKeys = Object.keys(schema.properties).sort();
  const fixtureKeys = Object.keys(fixture).sort();
  add('F-04 fixture usa solo campos del schema', fixtureKeys.every((k) => schemaKeys.includes(k)), fixtureKeys.filter((k) => !schemaKeys.includes(k)).join(','));
  add('F-04 fixture tiene todos los required', schema.required.every((k) => fixtureKeys.includes(k)));
  add('F-04 fixture sin content (F-11)', !('content' in fixture));
  let policyOk = false;
  let policyErr = '';
  try {
    policyOk = client.validatePolicy(fixture, { nowS: fixture.ts }) === true;
  } catch (err) {
    policyErr = err.message;
  }
  add('F-04 validatePolicy real acepta la política Lua', policyOk, policyErr);
  for (const field of schema.required) add('F-04 módulo emite ' + field, new RegExp('["\']' + field + '["\']').test(rawModule));
  for (const field of schema.properties.ref.required) add('F-04 módulo emite ref.' + field, new RegExp('["\']' + field + '["\']').test(rawModule));

  // 4 · V3-F-06: zona dedicada en la zone file + snippet que la usa; playback intacto.
  add('F-06 zone file declara ara_sync_lua', /limit_req_zone\s+\$binary_remote_addr\s+zone=ara_sync_lua:1m\s+rate=3r\/m;/.test(zone));
  add('F-06 zone file limit_req_status 429', /limit_req_status\s+429;/.test(zone));
  add('F-06 snippet usa zone=ara_sync_lua', /limit_req\s+zone=ara_sync_lua\s+burst=6\s+nodelay;/.test(snippetCode));
  const playback = /\/lists\/|\.m3u8|\.m4s|\.ts\b|\/cdn\/|\/meta\//;
  add('F-06 zone sin playback', !playback.test(zoneCode));
  add('F-06 snippet sin playback', !playback.test(snippetCode));

  // 5 · V3-F-07: Retry-After en ambos snippets y en el 429 Lua.
  add('F-07 PHP snippet Retry-After', /add_header\s+Retry-After\s+30\s+always;/.test(phpSnippet));
  add('F-07 Lua snippet Retry-After', /add_header\s+Retry-After\s+30\s+always;/.test(snippetCode));
  add('F-07 módulo 429 Retry-After', /RATE_RETRY_AFTER\s*=\s*30/.test(rawModule) && /Retry-After/.test(rawModule));

  // 6 · V3-F-08: PHP fail-closed en device_ids y permisos del store.
  add('F-08 device_ids no vacío', /count\(\$deviceIds\)\s*<\s*1/.test(php));
  add('F-08 device_id enlazado', /\$deviceBound/.test(php) && /in_array|\$boundId === \$payload\['device_id'\]/.test(php));
  add('F-08 store 0600', /fileperms\(\$keysPath\)/.test(php) && /&\s*0077/.test(php));

  // 7 · V3-F-11: no se inyecta contenido de shared; F-10 ya cubierto arriba.
  add('F-11 sin content_json', !/content_json/.test(rawModule));
  add('F-11 sin lectura de lab_content', !/get\(["']lab_content/.test(rawModule));

  // 8 · snippet: solo location = /sync + 16k + limit_req + handler
  const locations = snippetCode.match(/\blocation\b/g) || [];
  add('snippet: exactamente 1 location', locations.length === 1, String(locations.length));
  add('snippet: location = /sync', /location\s*=\s*\/sync\s*\{/.test(snippetCode));
  add('snippet: client_max_body_size 16k', /client_max_body_size\s+16k;/.test(snippetCode));
  add('snippet: content_by_lua_file del módulo', /content_by_lua_file\s+\/etc\/nginx\/lua\/ara_x_sync\.lua;/.test(snippetCode));
  const snippetForbidden = [
    ['/lists/', /\/lists\//],
    ['proxy_', /proxy_/],
    ['limit_conn', /limit_conn/],
    ['body_filter', /body_filter/],
    ['sub_filter', /sub_filter/],
    ['rewrite', /\brewrite\b/],
    ['listen', /\blisten\b/],
    ['lua_shared_dict como directiva', /lua_shared_dict/],
    ['limit_req_zone como directiva', /limit_req_zone/]
  ];
  for (const [name, re] of snippetForbidden) add('snippet sin ' + name, !re.test(snippetCode));

  // 9 · 8K solo presentación
  add('8K presentation_only', /presentation_only/.test(rawModule));
  add('sin resolución 8K en display', !/wire_resolution["']?\s*[:=]\s*["']7680/.test(rawModule));

  // 10 · paridad de canonicalización con el cliente D3
  const canonical = client.canonicalRequestString({
    deviceId: 'onn4k-001',
    seq: 7,
    ts: 1700000000,
    nonce: 'abc123def4567890',
    bodyHash: 'f'.repeat(64)
  });
  add('paridad canonical: prefijo/orden D3', canonical === [
    'ARA-X-SYNC-V1', 'onn4k-001', '7', '1700000000', 'abc123def4567890', 'f'.repeat(64)
  ].join('\n'));
  add('módulo usa el prefijo del cliente', rawModule.includes('M.REQ_PREFIX = "' + client.REQ_PREFIX + '"'));
  add('módulo usa el prefijo de respuesta', rawModule.includes('M.RESP_PREFIX = "' + client.RESP_PREFIX + '"'));

  // 11 · V3-F-05 + F-01/F-09: limitaciones documentadas, NO-GO sin declarar fix.
  add('F-05 README global-key NO-GO', /F-05/.test(readme) && /NO-GO/i.test(readme) && /global/i.test(readme));
  add('F-05 per-device NO resuelto', /NO RESUELTO/.test(readme) || /no resuelto/i.test(readme));
  add('F-01/F-09 NO-GO owner documentado', /F-01/.test(readme) && /F-09/.test(readme) && /NO-GO/i.test(readme));

  // 12 · staged
  add('módulo staged en repo', fs.existsSync(path.join(ROOT, FILES.module)));
  add('sin copia en _vps_stage (módulo)', !fs.existsSync(path.join(ROOT, '_vps_stage/lua/ara_x_sync.lua')));
  add('sin copia en _vps_stage (snippet)', !fs.existsSync(path.join(ROOT, '_vps_stage/nginx/ara-sync-lua.conf')));
  add('keys example sin binding nulo', !/"device_ids"\s*:\s*null/.test(read(FILES.keysExample)));

  const failures = checks.filter((c) => !c.ok).map((c) => c.name + (c.detail ? ' :: ' + c.detail : ''));
  return { ok: failures.length === 0, checks, failures };
}

if (require.main === module) {
  const result = run();
  for (const c of result.checks) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail ? '  (' + c.detail + ')' : ''));
  console.log('---');
  if (!result.ok) {
    console.error('FAIL: ' + result.failures.length + ' check(s)');
    process.exit(1);
  }
  console.log('ALL CHECKS PASS (' + result.checks.length + '/' + result.checks.length + ')');
}

module.exports = { run, FILES, ROOT };
