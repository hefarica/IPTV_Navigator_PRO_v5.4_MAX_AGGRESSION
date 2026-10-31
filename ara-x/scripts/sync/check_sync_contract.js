'use strict';

/**
 * I3 · verificador determinista del endpoint `/sync` staged.
 *
 * Comprueba, sin red y sin VPS:
 *  - los dos schemas parsean y coinciden con el generador (drift gate);
 *  - el PHP staged no tiene funciones de red/exec, no loguea secretos y mantiene
 *    no-store/nosniff, HMAC constant-time, nonce/idempotencia y BEGIN IMMEDIATE;
 *  - el snippet nginx no usa ngx.exit, no toca timeouts/limit_conn/proxy del playback
 *    y limita SOLO /sync (3r/m burst 6) sobre 443;
 *  - el ack L3 lleva las 3 traducciones contrato→wire (gate denied, lifecycle, clamped);
 *  - D4-F10 (soc unknown + soc_raw) está admitido de forma fail-closed;
 *  - el PHP sigue staged y `php -l` local figura NOT_RUN (PHP no instalado).
 *
 * Uso: node ara-x/scripts/sync/check_sync_contract.js [repo-root]   → exit 1 si falla algo.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));

const FILES = {
  client: 'ara-x/vps/client/ara_sync_client.js',
  catalog: 'ara-x/vps/schema/sync_features.json',
  reqSchema: 'ara-x/vps/schema/sync_request.schema.json',
  resSchema: 'ara-x/vps/schema/sync_response.schema.json',
  example: 'ara-x/vps/schema/device_policy.example.json',
  php: 'ara-x/vps/php/ara-sync.php',
  keys: 'ara-x/vps/php/config/ara-sync-keys.example.json',
  nginx: 'ara-x/vps/nginx/ara-sync.conf',
  zone: 'ara-x/vps/nginx/ara-sync-zone.conf',
  deployDoc: 'ara-x/vps/DEPLOY_MAP_ENTRY.md',
  generator: 'ara-x/scripts/gen_sync_schemas.js'
};

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error('faltante: ' + rel);
  return fs.readFileSync(full, 'utf8');
}

function run() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail || '' });
  const fail = [];

  // 1 · schemas generados (sin drift)
  let generator;
  try {
    generator = require(path.join(ROOT, FILES.generator));
  } catch (err) {
    add('generator cargable', false, err.message);
  }
  if (generator) {
    const out = generator.outputs();
    add('request schema sin drift', read(FILES.reqSchema) === out.request, 'generado por gen_sync_schemas.js');
    add('response schema sin drift', read(FILES.resSchema) === out.response, 'generado por gen_sync_schemas.js');
  }
  const req = JSON.parse(read(FILES.reqSchema));
  const res = JSON.parse(read(FILES.resSchema));
  const catalog = JSON.parse(read(FILES.catalog));
  JSON.parse(read(FILES.example));
  add('schemas JSON válidos', true, 'request+response+example');

  // 2 · D4-F10: soc unknown + soc_raw
  const socEnum = req.properties.client.properties.soc.enum;
  add('client.soc admite unknown', socEnum.includes('unknown'), socEnum.join('|'));
  add('catálogo request = canónico+unknown', JSON.stringify(catalog.socs.request) === JSON.stringify(['mt8696', 'amlogic', 's905x4', 's905x3', 'unknown']));
  add('response device.soc admite unknown', res.properties.device.properties.soc.enum.includes('unknown'));
  const clientSrc = read(FILES.client);
  add('cliente exige soc_raw si unknown', /soc=unknown requires a valid soc_raw/.test(clientSrc));
  add('mock/php fail-closed soc_unmapped', /soc_unmapped/.test(read(FILES.php)));

  // 3 · ack translations (3 del contrato D4)
  const ack = req.properties.metrics && req.properties.state.properties.apply;
  const ackText = JSON.stringify(req.properties.state.properties.apply);
  add('ack L3 en state.apply', Boolean(ack) && ack.required && ack.required.includes('st'));
  add('ack soc.m/c admiten unknown', ackText.includes('"unknown"'));
  add('traducción gate denied (soc.g)', /gate_denied|not_allowlisted/.test(read(FILES.catalog)) && /translateAck/.test(clientSrc));
  add('traducción lifecycle → lifecycle_pending', /player_inactive/.test(read(FILES.catalog)) && /lifecycle_pending/.test(read(FILES.catalog)));
  add('traducción clamped[].key → cl[].k', /clamped/.test(read(FILES.catalog)) && /clamped/.test(clientSrc));

  // 4 · PHP staged: anti-red, no secretos en logs, headers y replay
  const php = read(FILES.php);
  const net = php.match(/curl_|file_get_contents|fsockopen|stream_socket|get_headers|shell_exec|proc_open|popen|eval\(/g) || [];
  add('PHP sin funciones de red/exec', net.length === 0, net.join(','));
  const httpLit = php.match(/https?:\/\//g) || [];
  add('PHP sin literales http(s)://', httpLit.length === 0);
  add('PHP no-store + nosniff', /Cache-Control: no-store/.test(php) && /X-Content-Type-Options: nosniff/.test(php));
  add('PHP HMAC constant-time', /hash_equals\(/.test(php));
  add('PHP nonce single-use + replay', /ara_sync_nonce/.test(php) && /ara_sync_replay/.test(php));
  add('PHP idempotencia 200 exacto', /X-ARA-Idempotent: 1/.test(php));
  add('PHP BEGIN IMMEDIATE', /BEGIN IMMEDIATE/.test(php));
  add('PHP body 16 KB', /ARA_MAX_BODY = 16384/.test(php));
  const logLines = php.split(/\r?\n/).filter((l) => /error_log\s*\(/.test(l));
  const logLeak = logLines.filter((l) => /secret|presented|bodyHash|raw\b|nonce/i.test(l));
  add('PHP logs sin secretos/nonce/body', logLeak.length === 0, logLeak.join(' | '));
  const secretLiterals = php.match(/secret\s*=\s*['"][a-f0-9]{32,}['"]/gi) || [];
  add('PHP sin claves hardcodeadas', secretLiterals.length === 0, secretLiterals.join(','));
  add('claves desde archivo/env', /ARA_SYNC_KEYS_FILE/.test(php) && /getenv\('ARA_SYNC_KEYS_FILE'\)/.test(php));
  const keysExample = read(FILES.keys);
  add('keys example sin secreto real', /REPLACE_WITH_64/.test(keysExample) && !/[a-f0-9]{64}/i.test(keysExample));

  // 5 · nginx: no playback touched, solo /sync, 443
  const nginx = read(FILES.nginx);
  const zone = read(FILES.zone);
  const nginxAll = nginx + '\n' + zone;
  add('nginx sin ngx.exit', !/ngx\.exit/.test(nginxAll));
  add('nginx no toca proxy_read_timeout', !/proxy_read_timeout/.test(nginxAll));
  add('nginx no toca proxy_next_upstream', !/proxy_next_upstream/.test(nginxAll));
  add('nginx no toca limit_conn', !/limit_conn/.test(nginxAll));
  add('nginx no toca proxy_buffering', !/proxy_buffering/.test(nginxAll));
  add('nginx sin listen 80', !/listen\s+80/.test(nginxAll) && !/listen\s+\[::\]:80/.test(nginxAll));
  add('location = /sync', /location\s*=\s*\/sync\s*\{/.test(nginx));
  add('limit_req solo en /sync', (nginx.match(/limit_req\s/g) || []).length === 1 && /limit_req zone=ara_sync burst=6/.test(nginx));
  add('limit_req zone 3r/m', /limit_req_zone\s+\$binary_remote_addr\s+zone=ara_sync:1m\s+rate=3r\/m/.test(zone));
  add('limit_req_status 429', /limit_req_status\s+429/.test(zone));
  add('sin CORS en /sync', !/Access-Control-Allow-Origin/i.test(nginx));
  add('POST-only 405', /request_method\s*!~\s*\^\(POST\)/.test(nginx) && /return\s+405/.test(nginx));

  // 6 · staged + NOT_RUN documentado
  add('PHP staged en repo', fs.existsSync(path.join(ROOT, FILES.php)));
  add('sin copia desplegada en _vps_stage', !fs.existsSync(path.join(ROOT, '_vps_stage/php/ara-sync.php')));
  const doc = read(FILES.deployDoc);
  add('php -l local NOT_RUN documentado', /php -l.*NOT_RUN|NOT_RUN.*php -l/i.test(doc));
  add('matriz de errores documentada', /401/.test(doc) && /409/.test(doc) && /429/.test(doc) && /413/.test(doc) && /415/.test(doc));
  add('plan de rollout/rollback documentado', /rollback/i.test(doc) && /reload/i.test(doc));
  add('deploy NO-GO documentado', /NO-GO/.test(doc));

  for (const c of checks) if (!c.ok) fail.push(c.name + (c.detail ? ' :: ' + c.detail : ''));
  return { ok: fail.length === 0, checks, failures: fail };
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
