'use strict';

/**
 * I3-LUA + V3-R2 · contrato del módulo Lua `/sync` staged.
 *
 * No hay Lua/nginx en el host: verificación estática (checker + paridad con el
 * contrato D3 v2) y `luac -p`/`nginx -t` documentados como NOT_RUN.
 * Cubre las reparaciones V3 F-03/04/05/06/07/08/10/11.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const checker = require('../scripts/lua/check_lua_module.js');
const client = require('../vps/client/ara_sync_client.js');

const ROOT = path.join(__dirname, '..');
const MODULE_PATH = path.join(ROOT, 'vps', 'lua', 'ara_x_sync.lua');
const SNIPPET_PATH = path.join(ROOT, 'vps', 'nginx', 'ara-sync-lua.conf');
const README_PATH = path.join(ROOT, 'vps', 'lua', 'README.md');
const FIXTURE_PATH = path.join(ROOT, 'vps', 'lua', 'ara_x_sync.policy.example.json');
const RES_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'vps', 'schema', 'sync_response.schema.json'), 'utf8'));

const moduleRaw = fs.readFileSync(MODULE_PATH, 'utf8');
const snippetRaw = fs.readFileSync(SNIPPET_PATH, 'utf8');
const readme = fs.readFileSync(README_PATH, 'utf8');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function codeOnly(text, commentMarker) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(new RegExp(commentMarker + '.*$'), ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
}

const moduleCode = codeOnly(moduleRaw, '--');

test('checker estático (F-03..F-11) pasa', () => {
  const result = checker.run();
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.checks.length >= 100);
});

test('F-03: sin carga de helper con side effects; SHA-256/HMAC embebidos', () => {
  assert.doesNotMatch(moduleCode, /\brequire\s*\(/);
  assert.doesNotMatch(moduleCode, /ape_attr/i);
  assert.doesNotMatch(moduleCode, /M\.serve/);
  assert.match(moduleRaw, /local function sha256\(/);
  assert.match(moduleRaw, /local function hmac_sha256\(/);
  assert.match(moduleRaw, /local function load_key\(/);
  assert.match(moduleRaw, /M\.REQ_PREFIX\s*=\s*"ARA-X-SYNC-V1"/);
  assert.match(moduleRaw, /M\.RESP_PREFIX\s*=\s*"ARA-X-SYNC-RESP-V1"/);
  assert.match(moduleRaw, /table\.concat\(\{\s*M\.REQ_PREFIX,\s*device_id,\s*tostring\(seq\),\s*tostring\(ts\),\s*nonce,\s*body_hash\s*\},\s*"\\n"\)/);
  assert.match(moduleRaw, /table\.concat\(\{\s*M\.RESP_PREFIX,\s*device_id,\s*tostring\(seq\),\s*tostring\(ts\),\s*resp_hash\s*\},\s*"\\n"\)/);
});

test('F-04: la política solo usa campos del schema y validatePolicy real la acepta', () => {
  assert.doesNotMatch(moduleCode, /soc_canonical/);
  assert.doesNotMatch(moduleCode, /"prov"\s*:/);
  assert.doesNotMatch(moduleCode, /"conf"\s*:/);
  const schemaKeys = Object.keys(RES_SCHEMA.properties);
  assert.deepEqual(Object.keys(fixture).filter((k) => !schemaKeys.includes(k)), []);
  for (const field of RES_SCHEMA.required) {
    assert.ok(field in fixture, 'falta ' + field);
    assert.match(moduleRaw, new RegExp('["\']' + field + '["\']'));
  }
  for (const field of RES_SCHEMA.properties.ref.required) {
    assert.ok(field in fixture.ref, 'falta ref.' + field);
  }
  assert.equal(client.validatePolicy(fixture, { nowS: fixture.ts }), true);
  assert.equal(fixture.display.never_downscale, true);
  assert.equal(fixture.display.eight_k, 'presentation_only');
});

test('F-05: clave global documentada como NO-GO (no resuelta)', () => {
  assert.match(readme, /F-05/);
  assert.match(readme, /NO RESUELTO/);
  assert.match(readme, /NO-GO/);
  assert.match(readme, /global/i);
  assert.match(moduleRaw, /F-05/);
});

test('F-06: zone file define ara_sync_lua y el snippet la usa; playback sin límites', () => {
  const zonePath = path.join(ROOT, 'vps', 'nginx', 'ara-sync-zone.conf');
  const zone = fs.readFileSync(zonePath, 'utf8');
  const zoneCode = codeOnly(zone, '#');
  assert.match(zone, /limit_req_zone\s+\$binary_remote_addr\s+zone=ara_sync_lua:1m\s+rate=3r\/m;/);
  assert.match(zone, /limit_req_status\s+429;/);
  const snippetCode = codeOnly(snippetRaw, '#');
  assert.match(snippetCode, /limit_req\s+zone=ara_sync_lua\s+burst=6\s+nodelay;/);
  for (const re of [/\/lists\//, /\.m3u8/, /\.m4s/, /\.ts\b/, /\/cdn\//, /\/meta\//]) {
    assert.equal(re.test(zoneCode), false, 'zone no debe tocar playback: ' + String(re));
    assert.equal(re.test(snippetCode), false, 'snippet no debe tocar playback: ' + String(re));
  }
});

test('F-07: Retry-After en el 429 del módulo y en ambos snippets', () => {
  assert.match(moduleRaw, /RATE_RETRY_AFTER\s*=\s*30/);
  assert.match(moduleRaw, /\["Retry-After"\]/);
  const phpSnippet = codeOnly(fs.readFileSync(path.join(ROOT, 'vps', 'nginx', 'ara-sync.conf'), 'utf8'), '#');
  assert.match(phpSnippet, /add_header\s+Retry-After\s+30\s+always;/);
  assert.match(codeOnly(snippetRaw, '#'), /add_header\s+Retry-After\s+30\s+always;/);
});

test('F-08: PHP exige device_ids no vacío + binding y store 0600', () => {
  const php = fs.readFileSync(path.join(ROOT, 'vps', 'php', 'ara-sync.php'), 'utf8');
  assert.match(php, /count\(\$deviceIds\)\s*<\s*1/);
  assert.match(php, /\$deviceBound/);
  assert.match(php, /\$boundId === \$payload\['device_id'\]/);
  assert.match(php, /fileperms\(\$keysPath\)/);
  assert.match(php, /&\s*0077/);
});

test('F-10: parser exige enteros, claves top-level permitidas y soc_raw para unknown', () => {
  assert.match(moduleRaw, /local function jint\(/);
  assert.match(moduleRaw, /non_integer/);
  assert.match(moduleRaw, /local function scan_top_keys\(/);
  assert.match(moduleRaw, /local ALLOWED_TOP/);
  assert.match(moduleRaw, /local REQUIRED_TOP/);
  assert.match(moduleRaw, /soc_raw_required/);
  assert.doesNotMatch(moduleRaw, /jnum\(body,\s*"seq"\)|jnum\(body,\s*"ts"\)/);
  assert.match(moduleRaw, /jint\(body,\s*"seq"\)/);
  assert.match(moduleRaw, /jint\(body,\s*"ts"\)/);
});

test('F-11: content no se emite ni se inyecta JSON de shared', () => {
  assert.doesNotMatch(moduleCode, /lab_content/);
  assert.doesNotMatch(moduleCode, /content_json/);
  assert.doesNotMatch(moduleCode, /"content"\s*:/);
});

test('snippet: solo location = /sync + 16k + limit_req dedicado + handler', () => {
  const code = codeOnly(snippetRaw, '#');
  assert.equal((code.match(/\blocation\b/g) || []).length, 1);
  assert.match(code, /location\s*=\s*\/sync\s*\{/);
  assert.match(code, /client_max_body_size\s+16k;/);
  assert.match(code, /limit_req\s+zone=ara_sync_lua\s+burst=6\s+nodelay;/);
  assert.match(code, /content_by_lua_file\s+\/etc\/nginx\/lua\/ara_x_sync\.lua;/);
  for (const re of [/\/lists\//, /proxy_/, /limit_conn/, /body_filter/, /sub_filter/, /\brewrite\b/, /\blisten\b/, /lua_shared_dict/, /limit_req_zone/]) {
    assert.equal(re.test(code), false, 'snippet no debe declarar ' + String(re));
  }
});

test('staged: sin copia en _vps_stage, NOT_RUN y NO-GO de producción', () => {
  assert.equal(fs.existsSync(path.join(ROOT, '_vps_stage', 'lua', 'ara_x_sync.lua')), false);
  assert.equal(fs.existsSync(path.join(ROOT, '_vps_stage', 'nginx', 'ara-sync-lua.conf')), false);
  assert.match(moduleRaw, /luac -p.*NOT_RUN|NOT_RUN.*luac -p/i);
  assert.match(moduleRaw, /nginx -t.*NOT_RUN|NOT_RUN.*nginx -t/i);
  assert.match(readme, /NO-GO/);
});
