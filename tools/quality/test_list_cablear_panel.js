#!/usr/bin/env node
/* test_list_cablear_panel.js — prueba el backend del panel de cableado (contrato t59).
 *
 * COMO PRUEBA SIN ESCRIBIR NADA EN NINGUN SITIO:
 *   Construye UN programa PHP = (cuerpo real de list_cablear_core.php) + (aserciones)
 *   y lo ejecuta con un interprete PHP. El store de la cola es 'mem' (array en el
 *   proceso): no se crea ni un fichero. La raiz de listas es la REAL del VPS en
 *   modo lectura, asi que la validacion de nombre se ejerce contra el sistema de
 *   ficheros de verdad, no contra un mock.
 *
 *   Interprete: `php` local si existe; si no, `ssh hetzner-iptv php -n` con el
 *   programa por stdin (mismo patron que usa _vps_stage/deploy/validate.sh con
 *   `php -l /dev/stdin`). Cero escrituras: no se sube ningun fichero.
 *
 * Cubre: los 12 vectores de path traversal del contrato, la idempotencia (dos POST
 * identicos -> un solo ticket), los cinco estados, la guardia de disco, el device
 * y la URL cableada exacta.
 *
 * Uso: node tools/quality/test_list_cablear_panel.js   -> exit 1 si algo falla
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api', 'list_cablear_core.php');

if (!fs.existsSync(CORE)) { console.error('FALTA ' + CORE); process.exit(1); }
const coreSrc = fs.readFileSync(CORE, 'utf8');
const coreBody = coreSrc.replace(/^<\?php\s*/, '');

/* ── Programa PHP de prueba ──────────────────────────────────────────────── */
const phpTest = `
/* ===== aserciones (generadas por tools/quality/test_list_cablear_panel.js) ===== */
$__fails = 0; $__skips = 0;
function t($nombre, $cond, $det = '') {
  global $__fails;
  if ($cond) { echo "PASS  $nombre" . ($det !== '' ? "  ($det)" : "") . "\\n"; }
  else { $__fails++; echo "FAIL  $nombre" . ($det !== '' ? "  ($det)" : "") . "\\n"; }
}
function skip($nombre, $por) { global $__skips; $__skips++; echo "SKIP  $nombre  ($por)\\n"; }

$LISTS = '/var/www/html/lists';
$REAL  = 'APE_LISTA_1794100720046.m3u8';   /* la lista del operador (medida) */
$STUB  = 'APE_LISTA_1793926685925.m3u8';   /* stub de 8 B con .gz (Placeholder Trick) */

$base = ape_cablear_io(array('store' => 'mem', 'mem' => array(), 'now_ms' => 1794700000000));

/* ---- 1..12: vectores del contrato (input.path_traversal_rule.checkable_vectors) ---- */
$vectores = array(
  array('../etc/passwd',                              'E_LISTA_NOMBRE_INVALIDO'),
  array('..%2F..%2Fetc%2Fpasswd',                     'E_LISTA_NOMBRE_INVALIDO'),
  array('sub/dir.m3u8',                               'E_LISTA_NOMBRE_INVALIDO'),
  array('.oculta.m3u8',                               'E_LISTA_NOMBRE_INVALIDO'),
  array('lista.m3u8.gz',                              'E_LISTA_NOMBRE_INVALIDO'),
  array('lista.txt',                                  'E_LISTA_NOMBRE_INVALIDO'),
  array("A\\0B.m3u8",                                 'E_LISTA_NOMBRE_INVALIDO'),
  array('APE_LISTA_X_CABLEADA.m3u8',                  'E_VARIANTE_NO_CABLEABLE'),
  array('NO_EXISTE.m3u8',                             'E_LISTA_NO_EXISTE'),
  array('http://169.254.169.254/latest/meta-data',    'E_HOST_NO_PERMITIDO'),
  array('ftp://host/x.m3u8',                          'E_ESQUEMA_NO_PERMITIDO'),
  array('http://user:pass@host/x.m3u8',               'E_URL_CON_CREDENCIALES'),
);
echo "== vectores del contrato (12) ==\\n";
foreach ($vectores as $v) {
  $io = ape_cablear_io(array('store' => 'mem', 'mem' => array(), 'now_ms' => 1794700000000));
  $r = ape_cablear_enqueue(array('lista' => $v[0], '_method' => 'POST'), $io);
  $err = isset($r['body']['error']) ? $r['body']['error'] : '';
  t('vector ' . $v[0], $err === $v[1], 'esperado=' . $v[1] . ' obtenido=' . ($err ?: '(ninguno)'));
}

/* ---- metodo ---- */
$r = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'GET'), $base);
t('metodo GET rechazado', isset($r['body']['error']) && $r['body']['error'] === 'E_METODO_NO_PERMITIDO',
  $r['http'] . ' ' . (isset($r['body']['error']) ? $r['body']['error'] : ''));

/* ---- lista vacia y demasiado larga ---- */
$r = ape_cablear_enqueue(array('lista' => '   ', '_method' => 'POST'), $base);
t('lista vacia', isset($r['body']['error']) && $r['body']['error'] === 'E_LISTA_REQUERIDA');
$r = ape_cablear_enqueue(array('lista' => str_repeat('a', 2100) . '.m3u8', '_method' => 'POST'), $base);
t('lista > 2048 bytes', isset($r['body']['error']) && $r['body']['error'] === 'E_LISTA_DEMASIADO_LARGA');

/* ---- guardia de disco (contrato disk_guard) ---- */
$ioDisco = ape_cablear_io(array('store' => 'mem', 'mem' => array(), 'free_mb' => 1000, 'now_ms' => 1794700000000));
$r = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $ioDisco);
t('disco libre < MIN_FREE_MB -> 507 E_DISCO_INSUFICIENTE',
  $r['http'] === 507 && isset($r['body']['error']) && $r['body']['error'] === 'E_DISCO_INSUFICIENTE',
  'http=' . $r['http']);

/* ---- device invalido (desviacion D2 declarada) ---- */
$r = ape_cablear_enqueue(array('lista' => $REAL, 'device' => 'corto', '_method' => 'POST'), $base);
t('device fuera de regex -> E_DEVICE_INVALIDO', isset($r['body']['error']) && $r['body']['error'] === 'E_DEVICE_INVALIDO');

/* ---- ENCOLADO REAL de la lista del operador (mem store: cero disco) ---- */
echo "\\n== encolado de la lista del operador ==\\n";
$io = ape_cablear_io(array('store' => 'mem', 'mem' => array(), 'now_ms' => 1794700000000));
$r1 = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $io);
t('encolado aceptado (202 queued)', $r1['http'] === 202 && $r1['body']['estado'] === 'queued',
  'http=' . $r1['http'] . ' estado=' . $r1['body']['estado']);
$tk = isset($r1['body']['ticket']) ? $r1['body']['ticket'] : '';
t('ticket con formato t-<13 digitos>-<8 alfanum>', (bool) preg_match('/^t-[0-9]{13}-[a-z0-9]{8}$/', $tk), $tk);
t('cola_posicion = 1', isset($r1['body']['cola_posicion']) && $r1['body']['cola_posicion'] === 1);
t('estado_url apunta al endpoint del contrato',
  isset($r1['body']['estado_url']) && strpos($r1['body']['estado_url'], '/prisma/api/cablear-estado.php?ticket=') === 0,
  $r1['body']['estado_url']);

/* ---- IDEMPOTENCIA: mismo POST dos veces = UN trabajo ---- */
$r2 = ape_cablear_enqueue(array('lista' => $REAL, '_method' => 'POST'), $io);
t('segundo POST identico -> 200 duplicado', $r2['http'] === 200 && $r2['body']['estado'] === 'duplicado',
  'http=' . $r2['http'] . ' estado=' . $r2['body']['estado']);
t('el duplicado devuelve EL MISMO ticket', isset($r2['body']['ticket']) && $r2['body']['ticket'] === $tk, $tk);
t('la cola tiene UN solo ticket', count($io['mem']['cola']) === 1, 'n=' . count($io['mem']['cola']));

/* ---- forzar=1 rompe la idempotencia a proposito ---- */
$r3 = ape_cablear_enqueue(array('lista' => $REAL, 'forzar' => '1', '_method' => 'POST'), $io);
t('forzar=1 crea un ticket NUEVO', $r3['http'] === 202 && $r3['body']['ticket'] !== $tk,
  'ticket=' . (isset($r3['body']['ticket']) ? $r3['body']['ticket'] : ''));
t('fuerza: la cola tiene 2 tickets', count($io['mem']['cola']) === 2);

/* ---- ESTADO ---- */
echo "\\n== endpoint de estado ==\\n";
$s = ape_cablear_status(array('ticket' => $tk), $io);
t('estado del ticket encolado = queued', $s['http'] === 200 && $s['body']['estado'] === 'queued', $s['body']['estado']);
t('el cuerpo trae los ocho campos del contrato',
  isset($s['body']['ok'], $s['body']['ticket'], $s['body']['estado'], $s['body']['fase'], $s['body']['progreso'],
        $s['body']['entrada'], $s['body']['salida'], $s['body']['timestamps'], $s['body']['intentos'],
        $s['body']['wiring_version']));
t('publicar=0 -> url_cableada es null (invariante I3)', $s['body']['salida']['url_cableada'] === null);

$s = ape_cablear_status(array('ticket' => 't-0000000000000-abcdefgh'), $io);
t('ticket inexistente -> 410 expired', $s['http'] === 410 && $s['body']['estado'] === 'expired');
$s = ape_cablear_status(array('ticket' => 'basura'), $io);
t('formato de ticket invalido -> 404', $s['http'] === 404);
$s = ape_cablear_status(array('ticket' => $tk, 'lista' => $REAL), $io);
t('dos parametros -> 400 E_CONSULTA_AMBIGUA', $s['http'] === 400 && $s['body']['error'] === 'E_CONSULTA_AMBIGUA');
$s = ape_cablear_status(array(), $io);
t('cero parametros -> 400 E_CONSULTA_AMBIGUA', $s['http'] === 400);
$s = ape_cablear_status(array('ultimos' => '10'), $io);
t('?ultimos=10 devuelve los tickets', $s['http'] === 200 && $s['body']['count'] === 2, 'count=' . $s['body']['count']);
$s = ape_cablear_status(array('lista' => $REAL), $io);
t('?lista=<nombre> reengancha', $s['http'] === 200 && $s['body']['count'] === 2);

/* ---- done: la URL cableada exacta ---- */
$hecho = $io['mem']['cola'][array_key_first($io['mem']['cola'])];
$hecho['estado'] = 'done'; $hecho['fase'] = 'fin';
$hecho['salida']['publicada'] = true;
$hecho['salida']['bytes'] = 1311467322;
$hecho['salida']['sha256'] = str_repeat('a', 64);
$hecho['progreso']['canales'] = 21224; $hecho['progreso']['envueltos'] = 21224;
$io['mem']['hechos'] = array($hecho['ticket'] . '.json' => $hecho);
$io['mem']['cola'] = array();
$s = ape_cablear_status(array('ticket' => $hecho['ticket']), $io);
t('estado done', $s['body']['estado'] === 'done', $s['body']['estado']);
t('url_cableada exacta del contrato',
  $s['body']['salida']['url_cableada'] === 'https://iptv-ape.duckdns.org/lists/' . $hecho['salida']['nombre'],
  (string) $s['body']['salida']['url_cableada']);
t('url_gz acompaña', $s['body']['salida']['url_gz'] === $s['body']['salida']['url_cableada'] . '.gz');
t('nombre determinista <base>_CABLEADA.m3u8',
  substr($s['body']['salida']['nombre'], -14) === '_CABLEADA.m3u8', $s['body']['salida']['nombre']);
t('canales cableados > 0', $s['body']['progreso']['canales'] > 0, 'canales=' . $s['body']['progreso']['canales']);

/* ---- los CINCO directorios de la cola (hallazgo de t62) ---- */
/* El .path del worker solo crea cola/. Si el encolado no crea los cinco, el
 * ticket se queda en cola/ para siempre porque el worker no puede renombrarlo
 * a tomados/. Esto lo prueba con un mkdir inyectado: no se escribe en disco. */
echo "\\n== los cinco directorios de la cola ==\\n";
$intentos = array();
$ioMkdir = ape_cablear_io(array(
  'store' => 'fs', 'mkdir' => function ($d) use (&$intentos) { $intentos[] = $d; return true; },
  'now_ms' => 1794700000000,
));
ape_cablear_validate(array('lista' => $REAL, '_method' => 'POST'), $ioMkdir);
$esperados = array('cola', 'tomados', 'hechos', 'fallidos', 'staging');
$faltan = array();
foreach ($esperados as $sub) {
  $hit = false;
  foreach ($intentos as $d) { if (substr($d, -strlen('/' . $sub)) === '/' . $sub) { $hit = true; break; } }
  if (!$hit) { $faltan[] = $sub; }
}
t('se intentan crear los CINCO directorios', count($intentos) >= 6,
  'intentos=' . count($intentos) . ' (' . implode(', ', $intentos) . ')');
t('no falta ninguno de cola/tomados/hechos/fallidos/staging', count($faltan) === 0,
  $faltan ? 'faltan: ' . implode(',', $faltan) : 'los cinco');
t('se crea tambien el padre /var/lib/ape/cablear',
  in_array(rtrim($ioMkdir['queue_root'], '/'), $intentos, true));

/* Falla SOLO al crear cola/ (el padre y los otros cuatro si "se crean"): asi se
 * prueba que el motivo nombra EXACTAMENTE el directorio que fallo, no uno
 * cualquiera. Con un mkdir que falla siempre, el primero en fallar es el padre
 * /var/lib/ape/cablear — tambien literal, pero menos preciso. */
$ioFalla = ape_cablear_io(array(
  'store' => 'fs',
  'mkdir' => function ($d) { return substr($d, -5) === '/cola' ? false : true; },
  'now_ms' => 1794700000000,
));
$vf = ape_cablear_validate(array('lista' => $REAL, '_method' => 'POST'), $ioFalla);
t('si mkdir falla -> E_COLA_NO_ESCRIBIBLE 500', $vf[1] === 'E_COLA_NO_ESCRIBIBLE' && $vf[2] === 500,
  'code=' . (string) $vf[1] . ' http=' . (string) $vf[2]);
t('el motivo lleva la RUTA literal del directorio que fallo (no un fallo mudo)',
  strpos((string) $vf[3], '/var/lib/ape/cablear/cola') !== false, (string) $vf[3]);

/* ---- una sola pasada: la salida cableada no se re-cablea ---- */
$ioUrl = ape_cablear_io(array('store' => 'mem', 'mem' => array(), 'allowlist' => '/dev/null'));
$r = ape_cablear_enqueue(array('lista' => APE_CABLEAR_BASE . '/lists/X_CABLEADA.m3u8', '_method' => 'POST'), $ioUrl);
t('una URL *_CABLEADA.m3u8 externa no pasa (host no permitido)',
  isset($r['body']['error']) && $r['body']['error'] === 'E_HOST_NO_PERMITIDO',
  isset($r['body']['error']) ? $r['body']['error'] : '');

echo "\\n" . ($__fails ? 'FALLOS: ' . $__fails : 'OK: todos los controles en verde') . ($__skips ? '  ·  saltados: ' . $__skips : '') . "\\n";
exit($__fails ? 1 : 0);
`;

const program = '<?php\n' + coreBody + '\n' + phpTest;

/* ── Ejecutar: php local, o ssh con stdin (cero escrituras) ──────────────── */
function run(cmd, args, input) {
  return spawnSync(cmd, args, { input: input, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
}

let r = run('php', ['-n'], program);
if (r.error && r.error.code === 'ENOENT') {
  console.log('# php local no disponible: se ejecuta en el VPS por stdin (no se sube ningun fichero)');
  r = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'hetzner-iptv', 'php -n'], program);
}
if (r.error) { console.error('No se pudo ejecutar php: ' + r.error.message); process.exit(1); }

const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr.trim() : '');
process.stdout.write(out.endsWith('\n') ? out : out + '\n');

if (r.status === null || r.status === undefined) {
  console.error('php no devolvio estado (timeout?)');
  process.exit(1);
}
process.exit(r.status === 0 ? 0 : 1);
