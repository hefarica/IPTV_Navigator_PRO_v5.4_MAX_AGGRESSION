#!/usr/bin/env node
/*
 * test_list_cablear_panel.js — contrato offline del panel de cableado.
 *
 * Todas las fixtures viven en un tempdir y son ficheros reales: plain .m3u/.m3u8,
 * stubs con gzip, variantes y un symlink gzip negativo. No se usa VPS, SSH ni
 * una lista privada del entorno. El núcleo se ejecuta con PHP local y el listado
 * se invoca como endpoint CLI con APE_CABLEAR_LISTS_ROOT apuntando al tempdir.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api', 'list_cablear_core.php');
const LISTING = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api', 'cablear-listas.php');
if (!fs.existsSync(CORE) || !fs.existsSync(LISTING)) {
  console.error('FALTA el PHP autorizado del contrato');
  process.exit(1);
}

function phpQuote(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function runSync(cmd, args, input, env) {
  return spawnSync(cmd, args, {
    input,
    encoding: 'utf8',
    env: env || process.env,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
}
function tFactory() {
  let fails = 0;
  const lines = [];
  function t(name, condition, detail = '') {
    const line = (condition ? 'PASS  ' : 'FAIL  ') + name + (detail ? `  (${detail})` : '');
    lines.push(line);
    if (!condition) fails += 1;
  }
  return { t, lines, get fails() { return fails; } };
}
function writeFile(root, name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(file, value);
  return file;
}
function playlist(channels, extra = '') {
  let out = '#EXTM3U\n#EXT-X-APE-CHANNELS:' + channels + '\n' + extra;
  for (let i = 1; i <= channels; i += 1) {
    out += `#EXTINF:-1,Canal técnico ${i}\nhttps://provider.example/live/u/p/${10000 + i}.m3u8|User-Agent=APE\n`;
  }
  return out;
}
function collect(proc) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function main() {
  const qa = tFactory();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-cablear-panel-'));
  const queueRoot = path.join(tempRoot, 'queue');
  fs.mkdirSync(queueRoot, { recursive: true });

  const REAL = 'fixture_REAL.m3u8';
  const STUB = 'fixture_STUB.m3u8';
  const M3U = 'fixture_catalogo.m3u';
  const NORMAL = 'fixture_normal.m3u8';
  const SHORT_HLS = 'fixture_short_hls.m3u8';
  const LIGHT = 'LIGHT_legit.m3u';
  const SYMLINK_STUB = 'fixture_symlink_gz.m3u8';
  const stubPayload1 = playlist(17, '#EXT-X-APE-CODEC-REAL:hvc1.2.4.L153.B0\n');
  const stubPayload2 = playlist(18, '#EXT-X-APE-CODEC-REAL:hvc1.2.4.L150.B0\n') + 'cambio-gzip\n';
  const normalPayload = playlist(3, '#EXT-X-STREAM-INF:VIDEO-RANGE=PQ,CODECS="hvc1.2.4.L153.B0"\n') + 'x'.repeat(1400);

  writeFile(tempRoot, REAL, playlist(4, '#EXT-X-STREAM-INF:VIDEO-RANGE=PQ,CODECS="hvc1.2.4.L153.B0"\n'));
  writeFile(tempRoot, STUB, '#EXTM3U\n');
  writeFile(tempRoot, STUB + '.gz', zlib.gzipSync(stubPayload1));
  writeFile(tempRoot, M3U, playlist(2));
  writeFile(tempRoot, NORMAL, normalPayload);
  writeFile(tempRoot, NORMAL + '.gz', zlib.gzipSync('sidecar must be ignored for a normal plain source'));
  writeFile(tempRoot, SHORT_HLS, '#EXTM3U\n#EXTINF:-1,Corto pero real\nsegmento-corto.ts\n');
  writeFile(tempRoot, SHORT_HLS + '.gz', zlib.gzipSync(playlist(99)));
  writeFile(tempRoot, LIGHT, playlist(1));
  writeFile(tempRoot, REAL.replace(/\.m3u8$/, '_CABLEADA.m3u8'), '#EXTM3U\n');
  writeFile(tempRoot, REAL.replace(/\.m3u8$/, '_SHIELDED.m3u8'), '#EXTM3U\n');
  writeFile(tempRoot, 'catalogo_CABLEADA.m3u', '#EXTM3U\n');
  writeFile(tempRoot, SYMLINK_STUB, '#EXTM3U\n');
  const outsideGz = path.join(os.tmpdir(), `ape-cablear-outside-${process.pid}.gz`);
  fs.writeFileSync(outsideGz, zlib.gzipSync(stubPayload1));
  try { fs.symlinkSync(outsideGz, path.join(tempRoot, SYMLINK_STUB + '.gz')); } catch (e) {
    console.error('No se pudo crear fixture symlink gzip: ' + e.message);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outsideGz, { force: true });
    process.exit(1);
  }

  const coreSrc = fs.readFileSync(CORE, 'utf8');
  const coreBody = coreSrc.replace(/^<\?php\s*/, '');
  const listingBody = fs.readFileSync(LISTING, 'utf8');
  const gz2b64 = zlib.gzipSync(stubPayload2).toString('base64');
  const gzNormal2b64 = zlib.gzipSync('different ignored sidecar').toString('base64');
  const L = phpQuote(tempRoot);
  const R = phpQuote(REAL);
  const S = phpQuote(STUB);
  const M = phpQuote(M3U);
  const N = phpQuote(NORMAL);
  const H = phpQuote(SHORT_HLS);
  const LIGHTQ = phpQuote(LIGHT);
  const SYQ = phpQuote(SYMLINK_STUB);

  const phpTest = `
$__fails = 0;
function t($name, $cond, $detail = '') {
  global $__fails;
  if ($cond) { echo "PASS  " . $name . ($detail !== '' ? "  (" . $detail . ")" : "") . "\\n"; }
  else { $__fails++; echo "FAIL  " . $name . ($detail !== '' ? "  (" . $detail . ")" : "") . "\\n"; }
}
$LISTS = ${L}; $REAL = ${R}; $STUB = ${S}; $M3U = ${M}; $NORMAL = ${N}; $SHORT_HLS = ${H}; $LIGHT = ${LIGHTQ}; $SYMLINK = ${SYQ};
$__base_vars = array('APE_CABLEAR_ENGINE_BASE', 'APE_PUBLIC_BASE', 'APE_CABLEAR_BASE_URL');
foreach ($__base_vars as $__base_var) { putenv($__base_var . '='); }
$ioOpts = array('store' => 'mem', 'mem' => array(), 'lists_root' => $LISTS, 'free_mb' => 999999, 'now_ms' => 1794700000000);

/* Fixtures locales técnicas: barreras de nombre y variantes */
$vectores = array(
  array('../etc/passwd', 'E_LISTA_NOMBRE_INVALIDO'),
  array('..%2F..%2Fetc%2Fpasswd', 'E_LISTA_NOMBRE_INVALIDO'),
  array('sub/dir.m3u8', 'E_LISTA_NOMBRE_INVALIDO'),
  array('.oculta.m3u8', 'E_LISTA_NOMBRE_INVALIDO'),
  array('lista.m3u8.gz', 'E_LISTA_NOMBRE_INVALIDO'),
  array('lista.txt', 'E_LISTA_NOMBRE_INVALIDO'),
  array("A\\0B.m3u8", 'E_LISTA_NOMBRE_INVALIDO'),
  array('fixture_REAL_CABLEADA.m3u8', 'E_VARIANTE_NO_CABLEABLE'),
  array('fixture_REAL_SHIELDED.m3u8', 'E_VARIANTE_NO_CABLEABLE'),
  array('NO_EXISTE.m3u8', 'E_LISTA_NO_EXISTE'),
  array('http://169.254.169.254/latest/meta-data', 'E_HOST_NO_PERMITIDO'),
  array('ftp://host/x.m3u8', 'E_ESQUEMA_NO_PERMITIDO'),
  array('http://user:pass@host/x.m3u8', 'E_URL_CON_CREDENCIALES')
);
foreach ($vectores as $v) {
  $io = ape_cablear_io($ioOpts);
  $r = ape_cablear_enqueue(array('lista' => $v[0], '_method' => 'POST'), $io);
  t('vector ' . $v[0], (($r['body']['error'] ?? '') === $v[1]), 'esperado=' . $v[1] . ' obtenido=' . ($r['body']['error'] ?? ''));
}
$r = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'GET'), $ioOpts);
t('metodo GET rechazado', ($r['body']['error'] ?? '') === 'E_METODO_NO_PERMITIDO');
$r = ape_cablear_enqueue(array('lista' => '   ', '_method' => 'POST'), $ioOpts);
t('lista vacia', ($r['body']['error'] ?? '') === 'E_LISTA_REQUERIDA');
$r = ape_cablear_enqueue(array('lista' => str_repeat('a', 2100) . '.m3u8', '_method' => 'POST'), $ioOpts);
t('lista > 2048 bytes', ($r['body']['error'] ?? '') === 'E_LISTA_DEMASIADO_LARGA');

/* .m3u aceptado, LIGHT genérico aceptado y salida siempre .m3u8 */
$io = ape_cablear_io($ioOpts); $rM3u = ape_cablear_enqueue(array('lista' => $M3U, '_method' => 'POST'), $io);
t('.m3u aceptado', $rM3u['http'] === 202);
t('.m3u produce _CABLEADA.m3u8', (($io['mem']['cola'][array_key_first($io['mem']['cola'])]['salida']['nombre'] ?? '') === 'fixture_catalogo_CABLEADA.m3u8'));
$ioLight = ape_cablear_io($ioOpts); $rLight = ape_cablear_enqueue(array('lista' => $LIGHT, '_method' => 'POST'), $ioLight);
t('LIGHT genérico legítimo no se rechaza', $rLight['http'] === 202, 'http=' . $rLight['http']);

/* Un HLS corto con contenido sigue siendo plain autoritativo aunque diverja su sidecar. */
$ioShort = ape_cablear_io($ioOpts); $short = ape_cablear_enqueue(array('lista' => $SHORT_HLS, '_method' => 'POST'), $ioShort);
$shortTicket = $ioShort['mem']['cola'][array_key_first($ioShort['mem']['cola'])];
t('HLS corto con contenido no usa sidecar divergente', $short['http'] === 202 && ($shortTicket['entrada']['identidad']['source_kind'] ?? '') === 'plain' && ($shortTicket['entrada']['bytes_gz'] ?? null) === null);

/* Stub explícito bare: gzip efectivo, identidad plain+gz y ISIZE solo estimado */
$ioStub = ape_cablear_io($ioOpts); $s1 = ape_cablear_enqueue(array('lista' => $STUB, '_method' => 'POST'), $ioStub);
$ticketStub = $ioStub['mem']['cola'][array_key_first($ioStub['mem']['cola'])];
$identStub = $ticketStub['entrada']['identidad'];
t('stub usa gzip regular', $s1['http'] === 202 && ($identStub['source_kind'] ?? '') === 'gzip_stub');
t('stub conserva plain y gzip path/bytes/mtime/ctime/inode/dev', isset($identStub['path'], $identStub['bytes'], $identStub['mtime_epoch'], $identStub['ctime_epoch'], $identStub['inode'], $identStub['dev'], $identStub['gz']['path'], $identStub['gz']['bytes'], $identStub['gz']['mtime_epoch'], $identStub['gz']['ctime_epoch'], $identStub['gz']['inode'], $identStub['gz']['dev']));
t('ISIZE queda marcado como estimación no íntegra', ($identStub['expanded_bytes_is_estimate'] ?? false) === true && ($identStub['gz']['isize_exact'] ?? true) === false && ($identStub['gz']['integrity_validated'] ?? true) === false);
file_put_contents($LISTS . '/' . $STUB . '.gz.next', base64_decode('${gz2b64}'));
rename($LISTS . '/' . $STUB . '.gz.next', $LISTS . '/' . $STUB . '.gz');
clearstatcache(true, $LISTS . '/' . $STUB . '.gz');
$s2 = ape_cablear_enqueue(array('lista' => $STUB, '_method' => 'POST'), $ioStub);
t('cambio de gzip con stub sin cambio crea ticket nuevo', $s2['http'] === 202 && ($s2['body']['ticket'] ?? '') !== ($s1['body']['ticket'] ?? ''));
$ioSy = ape_cablear_io($ioOpts); $sy = ape_cablear_enqueue(array('lista' => $SYMLINK, '_method' => 'POST'), $ioSy);
t('source symlink gzip rechazado', ($sy['body']['error'] ?? '') === 'E_GZIP_ES_SYMLINK');

/* Plain normal manda aunque exista sidecar gzip; cambiar sidecar no cambia clave. */
$ioNormal = ape_cablear_io($ioOpts); $n1 = ape_cablear_enqueue(array('lista' => $NORMAL, '_method' => 'POST'), $ioNormal);
$normalTicket = $ioNormal['mem']['cola'][array_key_first($ioNormal['mem']['cola'])];
t('plain normal es autoritativo frente a gzip', ($normalTicket['entrada']['identidad']['source_kind'] ?? '') === 'plain' && $normalTicket['entrada']['bytes_gz'] === null);
file_put_contents($LISTS . '/' . $NORMAL . '.gz', base64_decode('${gzNormal2b64}')); clearstatcache(true, $LISTS . '/' . $NORMAL . '.gz');
$n2 = ape_cablear_enqueue(array('lista' => $NORMAL, '_method' => 'POST'), $ioNormal);
t('cambio de sidecar ignorado si plain normal no cambia', $n2['http'] === 200 && $n2['body']['estado'] === 'duplicado');

/* Base comun: engine > public > legacy /lists, con contrato estricto. */
putenv('APE_CABLEAR_ENGINE_BASE=https://engine.example/ape');
putenv('APE_PUBLIC_BASE=https://public.example/ape');
putenv('APE_CABLEAR_BASE_URL=https://legacy.example/lists');
list($baseOk, $baseValue) = ape_cablear_public_base_info();
t('precedencia usa APE_CABLEAR_ENGINE_BASE', $baseOk && $baseValue === 'https://engine.example/ape');
putenv('APE_CABLEAR_ENGINE_BASE=');
list($baseOk, $baseValue) = ape_cablear_public_base_info();
t('precedencia usa APE_PUBLIC_BASE', $baseOk && $baseValue === 'https://public.example/ape');
putenv('APE_PUBLIC_BASE=');
list($baseOk, $baseValue) = ape_cablear_public_base_info();
t('legacy elimina sufijo /lists', $baseOk && $baseValue === 'https://legacy.example');
putenv('APE_CABLEAR_BASE_URL=https://legacy.example/lists/');
list($baseOk, $baseValue) = ape_cablear_public_base_info();
t('base legacy normaliza trailing slash coherente con worker', $baseOk && $baseValue === 'https://legacy.example');
putenv('APE_CABLEAR_BASE_URL=https://legacy.example/lists?x=1');
list($baseOk, $baseValue) = ape_cablear_public_base_info();
t('base con query es invalida', !$baseOk && $baseValue === null);
$badBase = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $ioOpts);
t('enqueue rechaza base invalida sin filtrar ruta', ($badBase['body']['error'] ?? '') === 'E_BASE_PUBLICA_INVALIDA' && !preg_match('#/tmp/|/var/#', json_encode($badBase)));
foreach ($__base_vars as $__base_var) { putenv($__base_var . '='); }

$ioBase = ape_cablear_io($ioOpts);
putenv('APE_PUBLIC_BASE=https://base-a.example/ape');
$ba = ape_cablear_enqueue(array('lista' => $REAL, 'device' => str_repeat('Z', 16), '_method' => 'POST'), $ioBase);
$baTicket = $ioBase['mem']['cola'][array_key_first($ioBase['mem']['cola'])];
putenv('APE_PUBLIC_BASE=https://base-b.example/ape');
$bb = ape_cablear_enqueue(array('lista' => $REAL, 'device' => str_repeat('Z', 16), '_method' => 'POST'), $ioBase);
t('cambio de base cambia clave y crea ticket nuevo', $ba['http'] === 202 && $bb['http'] === 202 && $ba['body']['ticket'] !== $bb['body']['ticket'] && $baTicket['public_base'] === 'https://base-a.example/ape');
putenv('APE_PUBLIC_BASE=');

/* Límite dinámico: 0 lo desactiva; se comprueba la pista expandida del stub. */
putenv('APE_CABLEAR_MAX_BYTES=10');
$ioMax = ape_cablear_io($ioOpts); $mx = ape_cablear_enqueue(array('lista' => $STUB, '_method' => 'POST'), $ioMax);
t('maxstub rechaza por expanded hint', ($mx['body']['error'] ?? '') === 'E_LISTA_DEMASIADO_GRANDE');
putenv('APE_CABLEAR_MAX_BYTES=0');
$mx0 = ape_cablear_enqueue(array('lista' => $STUB, '_method' => 'POST'), $ioMax);
t('APE_CABLEAR_MAX_BYTES=0 desactiva solo ese límite', $mx0['http'] === 202);
putenv('APE_CABLEAR_MAX_BYTES=');
$ioDisk = ape_cablear_io(array_merge($ioOpts, array('free_mb' => 1000)));
$disk = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $ioDisk);
t('guardia de disco conserva E_DISCO_INSUFICIENTE', $disk['http'] === 507 && ($disk['body']['error'] ?? '') === 'E_DISCO_INSUFICIENTE');

/* Device se valida antes del duplicado; device/publicar normalizados crean claves distintas. */
$ioKey = ape_cablear_io($ioOpts); $devA = str_repeat('A', 16); $devB = str_repeat('B', 16);
$k1 = ape_cablear_enqueue(array('lista' => $REAL, 'device' => $devA, 'publicar' => '0', '_method' => 'POST'), $ioKey);
$bad = ape_cablear_enqueue(array('lista' => $REAL, 'device' => 'corto', 'publicar' => '0', '_method' => 'POST'), $ioKey);
$kp = ape_cablear_enqueue(array('lista' => $REAL, 'device' => $devA, 'publicar' => '1', '_method' => 'POST'), $ioKey);
$kd = ape_cablear_enqueue(array('lista' => $REAL, 'device' => $devB, 'publicar' => '0', '_method' => 'POST'), $ioKey);
$kdup = ape_cablear_enqueue(array('lista' => $REAL, 'device' => $devA, 'publicar' => '0', '_method' => 'POST'), $ioKey);
t('primer device/publicar encolado', $k1['http'] === 202);
t('device inválido gana al duplicado', ($bad['body']['error'] ?? '') === 'E_DEVICE_INVALIDO');
t('publicar distinto crea ticket nuevo', $kp['http'] === 202 && $kp['body']['ticket'] !== $k1['body']['ticket']);
t('device distinto crea ticket nuevo', $kd['http'] === 202 && $kd['body']['ticket'] !== $k1['body']['ticket']);
t('misma fuente/device/publicar devuelve duplicado', $kdup['http'] === 200 && $kdup['body']['ticket'] === $k1['body']['ticket']);

/* Status: base público configurable y url_gz solo con receipt validado. */
putenv('APE_PUBLIC_BASE=https://offline.example/ape');
$tk = $k1['body']['ticket']; $keyName = $tk . '.json'; $done = $ioKey['mem']['cola'][$keyName];
$done['estado'] = 'done'; $done['fase'] = 'fin'; $done['salida']['publicada'] = true; $done['salida']['gzip_validado'] = true;
$done['public_base'] = 'https://persisted.example/ape';
$done['salida']['bytes'] = 1234; $done['salida']['sha256'] = str_repeat('a', 64); $done['salida']['rawsourcehash'] = str_repeat('b', 64);
$done['salida']['tipo_lista'] = 'hls_media'; $done['salida']['url'] = 'https://persisted.example/ape/lists/' . $done['salida']['nombre'];
$done['salida']['passthrough'] = 3;
$done['device'] = str_repeat('D', 32);
$done['entrada']['url'] = 'https://user:pass@source.example/live.m3u8?token=SECRET';
$ioKey['mem']['hechos'] = array($keyName => $done); $ioKey['mem']['cola'] = array();
$status = ape_cablear_status(array('ticket' => $tk), $ioKey);
t('status expone vista útil sin identidad/device privados', isset($status['body']['entrada']['ref'], $status['body']['entrada']['nombre'], $status['body']['entrada']['bytes'], $status['body']['entrada']['estadisticas'], $status['body']['publicar']) && !isset($status['body']['entrada']['identidad'], $status['body']['device']));
t('status usa public_base persistida y pasa salida', $status['body']['public_base'] === 'https://persisted.example/ape' && $status['body']['salida']['url'] === $done['salida']['url']);
t('url_gz solo con gzip_validado', $status['body']['salida']['url_gz'] === $status['body']['salida']['url_cableada'] . '.gz');
t('status expone tipo_lista', ($status['body']['salida']['tipo_lista'] ?? '') === 'hls_media' && ($status['body']['entrada']['tipo_lista'] ?? '') === 'hls_media');
t('status expone passthrough sin simular nuevos cableados', ($status['body']['salida']['passthrough'] ?? -1) === 3);
$statusJson = json_encode($status['body']);
t('paths tokens y entrada.url sensible no salen al panel', strpos($statusJson, $LISTS) === false && strpos($statusJson, 'path_efectivo') === false && strpos($statusJson, 'SECRET') === false && strpos($statusJson, 'user:pass') === false && strpos($statusJson, str_repeat('D', 32)) === false);
t('receipt prefix y rawsourcehash', ($status['body']['receipt']['prefix'] ?? '') === 'APE_CABLEAR_RESULT' && strlen((string) ($status['body']['receipt']['rawsourcehash'] ?? '')) === 64);
$legacyId = 't-1794700000-legacy01'; $legacy = $done; $legacy['ticket'] = $legacyId; unset($legacy['public_base']);
$ioLegacy = ape_cablear_io(array_merge($ioOpts, array('mem' => array('hechos' => array($legacyId . '.json' => $legacy)))));
$legacyStatus = ape_cablear_status(array('ticket' => $legacyId), $ioLegacy);
t('status histórico acepta ticket de 10 dígitos y usa env', $legacyStatus['http'] === 200 && $legacyStatus['body']['public_base'] === 'https://offline.example/ape');
putenv('APE_PUBLIC_BASE=');

/* Prueba de directorios con callbacks existentes: no se inyecta lock. */
$attempts = array();
$ioMkdir = ape_cablear_io(array_merge($ioOpts, array('store' => 'fs', 'queue_root' => $LISTS . '/queue-callback', 'is_dir' => function ($d) { return false; }, 'mkdir' => function ($d) use (&$attempts) { $attempts[] = $d; return true; })));
ape_cablear_validate(array('lista' => $REAL, '_method' => 'POST'), $ioMkdir);
t('se preparan padre y cinco directorios con contrato 0750 documentado', count($attempts) >= 6 && in_array($ioMkdir['queue_root'], $attempts, true) && in_array($ioMkdir['queue_root'] . '/staging', $attempts, true));

/* Negativas fs reales: no sigue tickets, targets, temporales o dirs symlink. */
$fsIo = ape_cablear_io(array_merge($ioOpts, array('store' => 'fs', 'queue_root' => $LISTS . '/queue-secure')));
t('fs prepara directorios privados reales', ape_cablear_prepare_dirs($fsIo));
$fsDirs = ape_cablear_dirs($fsIo); $fsName = 't-1794700000-security';
$outside = $LISTS . '/outside-ticket.json'; file_put_contents($outside, '{"keep":true}');
symlink($outside, $fsDirs['cola'] . '/' . $fsName . '.json');
t('store_list ignora ticket symlink', count(ape_cablear_store_list($fsIo, 'cola')) === 0);
t('store_get rechaza ticket symlink', ape_cablear_store_get($fsIo, 'cola', $fsName . '.json') === null);
t('store_put rechaza target symlink sin modificar blanco', !ape_cablear_store_put($fsIo, 'cola', $fsName . '.json', array('new' => true)) && file_get_contents($outside) === '{"keep":true}');
unlink($fsDirs['cola'] . '/' . $fsName . '.json');
symlink($outside, $fsDirs['cola'] . '/.tmp-' . $fsName . '.json');
t('temp exclusivo aleatorio ignora symlink predecible', ape_cablear_store_put($fsIo, 'cola', $fsName . '.json', array('ticket' => $fsName)) && file_get_contents($outside) === '{"keep":true}');
t('cola real queda 0750 y ticket 0600', (fileperms($fsDirs['cola']) & 0777) === 0750 && (fileperms($fsDirs['cola'] . '/' . $fsName . '.json') & 0777) === 0600);
unlink($fsDirs['cola'] . '/' . $fsName . '.json'); mkdir($fsDirs['cola'] . '/' . $fsName . '.json');
t('store_put rechaza destino directorio', !ape_cablear_store_put($fsIo, 'cola', $fsName . '.json', array()));
symlink($outside, $fsDirs['root'] . '/enqueue.lock');
$locked = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $fsIo);
t('enqueue rechaza lock symlink', ($locked['body']['error'] ?? '') === 'E_COLA_BLOQUEADA' && file_get_contents($outside) === '{"keep":true}');
unlink($fsDirs['root'] . '/enqueue.lock');
rename($fsDirs['cola'], $fsDirs['cola'] . '-real'); symlink($fsDirs['cola'] . '-real', $fsDirs['cola']);
t('preparación de cola rechaza directorio symlink', !ape_cablear_prepare_dirs($fsIo));

echo "\\n" . ($__fails ? 'FALLOS: ' . $__fails : 'OK: todos los controles en verde') . "\\n";
exit($__fails ? 1 : 0);
`;
  const program = '<?php\n' + coreBody + '\n' + phpTest;

  try {
    const php = runSync('php', ['-n'], program, process.env);
    if (php.error && php.error.code === 'ENOENT') throw new Error('php local no disponible');
    const phpOut = (php.stdout || '') + (php.stderr ? `\n${php.stderr.trim()}` : '');
    process.stdout.write(phpOut.endsWith('\n') ? phpOut : `${phpOut}\n`);
    if (php.status !== 0) throw new Error(`suite PHP fallo con status ${php.status}`);

    const listingEnv = {
      ...process.env,
      APE_CABLEAR_LISTS_ROOT: tempRoot,
      APE_CABLEAR_ENGINE_BASE: '',
      APE_PUBLIC_BASE: 'https://offline.example/ape',
      APE_CABLEAR_BASE_URL: '',
      APE_CABLEAR_KEY: '',
      REQUEST_METHOD: 'GET',
    };
    const listing = runSync('php', ['-n', LISTING], '', listingEnv);
    if (listing.status !== 0) throw new Error(`listado PHP fallo: ${listing.stderr || listing.stdout}`);
    const listed = JSON.parse(listing.stdout);
    const byName = Object.fromEntries(listed.listas.map((item) => [item.nombre, item]));
    qa.t('listado incluye .m3u y LIGHT sin hardcode de prefijo', !!byName[M3U] && !!byName[LIGHT]);
    qa.t('listado excluye variantes CABLEADA/SHIELDED como fuentes', !byName['fixture_REAL_CABLEADA.m3u8'] && !byName['fixture_REAL_SHIELDED.m3u8']);
    qa.t('listado usa gzip solo para stub', byName[STUB] && byName[STUB].fuente_efectiva === 'gzip_stub' && byName[STUB].bytes_gz > 0 && byName[NORMAL].bytes_gz === null);
    qa.t('listado deja plain corto HLS autoritativo', byName[SHORT_HLS] && byName[SHORT_HLS].fuente_efectiva === 'plain' && byName[SHORT_HLS].bytes_gz === null);
    qa.t('listado marca ISIZE gzip como estimación', byName[STUB] && byName[STUB].bytes_descomprimidos_estimacion === true && /estimacion/.test(byName[STUB].bytes_descomprimidos_motivo));
    qa.t('listado no afirma hash expandido del stub', byName[STUB] && byName[STUB].sha256 === null && /no-se-afirma-hash/.test(byName[STUB].sha256_motivo));
    qa.t('listado toma canales del header efectivo', byName[STUB] && byName[STUB].canales === 18 && byName[REAL].canales === 4);
    qa.t('listado descubre variantes sin lista fija', byName[REAL] && byName[REAL].variantes && byName[REAL].variantes.cableada.existe && byName[REAL].variantes.shielded.existe);
    qa.t('listado expone base pública compatible', listed.base === 'https://offline.example/ape');
    qa.t('listado no expone identidad.path', byName[REAL] && !Object.prototype.hasOwnProperty.call(byName[REAL], 'identidad'));
    qa.t('listado declara nosniff', listingBody.includes("X-Content-Type-Options: nosniff"));

    const legacyListing = runSync('php', ['-n', LISTING], '', {
      ...listingEnv,
      APE_PUBLIC_BASE: '',
      APE_CABLEAR_BASE_URL: 'https://legacy.example/lists',
    });
    const legacyListed = JSON.parse(legacyListing.stdout);
    qa.t('listado normaliza base legacy /lists', legacyListing.status === 0 && legacyListed.base === 'https://legacy.example');
    const invalidListing = runSync('php', ['-n', LISTING], '', {
      ...listingEnv,
      APE_PUBLIC_BASE: 'https://bad.example/ape?token=SECRET',
    });
    const invalidBody = JSON.parse(invalidListing.stdout);
    qa.t('listado rechaza base inválida sin exponer secreto', invalidListing.status === 0 && invalidBody.error === 'E_BASE_PUBLICA_INVALIDA' && !invalidListing.stdout.includes('SECRET'));

    /* Concurrent POST real: procesos PHP separados, misma cola fs y lock real. */
    const concurrentCode = '<?php\n' + coreBody + `\n$io = ape_cablear_io(array('free_mb' => 999999));
$r = ape_cablear_enqueue(array('lista' => ${phpQuote(REAL)}, 'device' => str_repeat('C', 16), 'publicar' => '1', '_method' => 'POST'), $io);
echo json_encode(array('http' => $r['http'], 'body' => $r['body']), JSON_UNESCAPED_SLASHES) . "\\n";\n`;
    const concurrentEnv = {
      ...process.env,
      APE_CABLEAR_ROOT: queueRoot,
      APE_CABLEAR_LISTS_ROOT: tempRoot,
      APE_CABLEAR_STORE: 'fs',
      APE_CABLEAR_MAX_BYTES: '0',
      APE_PUBLIC_BASE: 'https://offline.example/ape',
      APE_CABLEAR_KEY: '',
    };
    const children = [];
    for (let i = 0; i < 8; i += 1) {
      const child = spawn('php', ['-n'], { env: concurrentEnv, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdin.end(concurrentCode);
      children.push(collect(child));
    }
    const results = await Promise.all(children);
    const parsed = results.map((r) => {
      if (r.status !== 0) throw new Error(`POST concurrente fallo: ${r.stderr || r.stdout}`);
      return JSON.parse(r.stdout.trim().split(/\n/).pop());
    });
    const tickets = new Set(parsed.map((r) => r.body.ticket));
    const accepted = parsed.filter((r) => r.http === 202).length;
    qa.t('concurrent POST fs produce un solo ticket', tickets.size === 1 && accepted === 1 && parsed.every((r) => r.http === 202 || r.http === 200));
    const queuedFiles = fs.readdirSync(path.join(queueRoot, 'cola')).filter((name) => /^t-.*\.json$/.test(name));
    qa.t('concurrent POST deja un solo JSON en cola', queuedFiles.length === 1);
    const queuedMode = queuedFiles.length === 1 ? (fs.statSync(path.join(queueRoot, 'cola', queuedFiles[0])).mode & 0o777) : 0;
    qa.t('ticket atómico queda con permisos 0600/0640', queuedMode === 0o600 || queuedMode === 0o640);

    for (const line of qa.lines) console.log(line);
    if (qa.fails) throw new Error(`FALLOS Node/listado/concurrencia: ${qa.fails}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outsideGz, { force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
