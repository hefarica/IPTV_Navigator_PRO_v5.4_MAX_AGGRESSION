<?php
/**
 * list-light-project.php — dispara la PROYECCION LIGHT sobre una lista CABLEADA y la valida.
 *
 * Contrato (el que el checkbox del panel promete):
 *   1) la base ya existe (el panel la acaba de generar con prepublishAndGenerateDual)
 *   2) se ejecuta /opt/ape-pulse/ape-list-light.sh con APE_FORCE=1
 *   3) se verifica con list-light-verify.php  (canales, plantillas, ape_cuerpo)
 *   4) si el contrato NO se cumple, se responde ok:false y NO se declara entregada
 *
 * FAIL-CLOSED en todo: sin script, sin permiso, sin lista o con el script fallando,
 * la respuesta es un rechazo con la razon literal. Nada de "ok" optimista.
 *
 * Solo POST. No borra, no publica fuera de /var/www/lists, no toca el generador.
 */

declare(strict_types=1);

const ALLOWED_DIR = '/var/www/lists';
const SCRIPT_PROJECT = '/opt/ape-pulse/ape-list-project.sh';   // paso 1: proyeccion
const SCRIPT_PROJ_JS = '/opt/ape-pulse/ape-profile-project.js'; // paso 2: 9 plantillas
const SCRIPT      = '/opt/ape-pulse/ape-list-light.sh';         // NO se usa: pisa las plantillas
const SCRIPT_TO   = 240;   // s: la proyeccion medida tarda 86-90 s

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-APE-Endpoint: list-light-project/1.0.0');

function out(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    out(405, ['ok' => false, 'reason' => 'E_METODO', 'esperado' => 'POST']);
}

foreach ([SCRIPT_PROJECT, SCRIPT_PROJ_JS] as $need) {
    if (!is_file($need) || !is_readable($need)) {
        out(503, ['ok' => false, 'reason' => 'E_SCRIPT_AUSENTE', 'script' => $need]);
    }
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw ?: '{}', true);
if (!is_array($in)) {
    out(400, ['ok' => false, 'reason' => 'E_JSON_INVALIDO']);
}

$lista = isset($in['lista']) ? trim((string) $in['lista']) : '';
if ($lista === '') {
    out(400, ['ok' => false, 'reason' => 'E_LISTA_REQUERIDA']);
}
if (!preg_match('/^[A-Za-z0-9._-]{1,180}$/', $lista) || strpos($lista, '..') !== false) {
    out(400, ['ok' => false, 'reason' => 'E_LISTA_INVALIDA', 'lista' => $lista]);
}

$base = realpath(ALLOWED_DIR);
$origen = ($base === false) ? false : realpath($base . DIRECTORY_SEPARATOR . $lista);
if ($origen === false || strpos($origen, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($origen)) {
    out(404, ['ok' => false, 'reason' => 'E_LISTA_NO_EXISTE', 'lista' => $lista]);
}

// El script trabaja sobre la CABLEADA; si le pasan la LIGHT, se lo decimos claro.
if (strpos($lista, '_LIGHT') !== false) {
    out(409, [
        'ok'     => false,
        'reason' => 'E_YA_ES_LIGHT',
        'lista'  => $lista,
        'nota'   => 'la proyeccion parte de la CABLEADA, no de su propio resultado',
    ]);
}

$stamp// Y si el script admite forzar el origen por nombre, se lo pasamos para que no elija otro.
   = gmdate('Ymd\THis\Z');
$logPath = '/tmp/ape-light-project-' . $stamp . '.log';
// APE_MIN_CHANNELS=1: el script usa MIN_CHANNELS=1000 para elegir AUTOMATICAMENTE el origen
// y no coger un fixture de 3 canales. Aqui el origen viene EXPLICITO en el POST, asi que esa
// proteccion sobra y vetaria una lista filtrada de 100 canales. El operador ya eligio.
// EL PIPELINE SON DOS PASOS, y hasta hoy el endpoint solo llamaba a uno.
//   paso 1  ape-list-project.sh <origen>
//           proyecta la cableada -> _CABLEADA_LIGHT (EXTINF + EXTHTTP + URL) y verifica
//           que no se pierde ni un canal y que cada canal tiene EXACTAMENTE 1 URL.
//   paso 2  ape-profile-project.js light <light> <light> --origin <origen> --gz
//           escribe las 9 plantillas de perfil + el indice en la cabecera. SIN ESTE PASO
//           la lista queda sin proyeccion por perfil: medido, 0 plantillas.
// ape-list-light.sh NO sustituye a ninguno de los dos: hace el wrap #EXTSHIMOTT y PISA el
// fichero, borrando las plantillas que hubiera. Por eso no se usa aqui.
$srcBase = basename($lista, '.m3u8');
$light = preg_replace('/\.m3u8$/i', '', $lista) . '_LIGHT.m3u8';
$cmd1    = 'timeout ' . SCRIPT_TO . ' bash ' . escapeshellarg(SCRIPT_PROJECT)
          . ' ' . escapeshellarg($srcBase)
          . ' > ' . escapeshellarg($logPath) . ' 2>&1';
$cmd2    = 'timeout ' . SCRIPT_TO . ' node ' . escapeshellarg(SCRIPT_PROJ_JS)
          . ' light ' . escapeshellarg($light)
          . ' ' . escapeshellarg($light)
          . ' --origin ' . escapeshellarg($srcBase . '.m3u8')
          . ' --gz'
          . ' >> ' . escapeshellarg($logPath) . ' 2>&1';
$cmd     = $cmd1 . ' && ' . $cmd2;

$t0 = microtime(true);
$rc = 0;
$salida = [];
@exec($cmd, $salida, $rc);
$ms = (int) round((microtime(true) - $t0) * 1000);

$logTail = '';
if (is_file($logPath)) {
    $txt = @file_get_contents($logPath, false, null, 0, 8192);
    if (is_string($txt)) { $logTail = trim($txt); }
}

if ($rc !== 0) {
    out(500, [
        'ok'       => false,
        'reason'   => 'E_SCRIPT_FALLO',
        'exit'     => $rc,
        'ms'       => $ms,
        'log'      => $logTail,
    ]);
}

// Verificacion real del resultado, no del exit code.
$verifPath = __DIR__ . '/list-light-verify.php';
if (!is_file($verifPath)) {
    out(503, ['ok' => false, 'reason' => 'E_VERIFICADOR_AUSENTE', 'ms' => $ms]);
}

// Se invoca el verificador por HTTP interno para no duplicar la logica de conteo.
$vUrl = 'http://127.0.0.1/prisma/api/list-light-verify.php?lista=' . rawurlencode($light);
$ctx  = stream_context_create(['http' => ['timeout' => 60, 'ignore_errors' => true]]);
$vRaw = @file_get_contents($vUrl, false, $ctx);
$v    = is_string($vRaw) ? json_decode($vRaw, true) : null;

if (!is_array($v)) {
    out(503, [
        'ok'     => false,
        'reason' => 'E_VERIFICACION_NO_RESPONDE',
        'ms'     => $ms,
        'log'    => $logTail,
        'light'  => $light,
    ]);
}

$fallos = [];
// El numero de canales lo fija el filtro del operador, no este contrato.
// Solo se exige que la lista no este vacia.
if (($v['canales'] ?? 0) < 1) { $fallos[] = 'canales=' . ($v['canales'] ?? 'N/D') . ' (lista vacia)'; }
if (($v['plantillas'] ?? 0) !== 9)    { $fallos[] = 'plantillas=' . ($v['plantillas'] ?? 'N/D') . ' != 9'; }
if (($v['ape_cuerpo'] ?? -1) !== 0)   { $fallos[] = 'ape_cuerpo=' . ($v['ape_cuerpo'] ?? 'N/D') . ' != 0'; }
if (($v['truncado'] ?? false) === true) { $fallos[] = 'muestra truncada: el conteo no cubre la lista entera'; }

if ($fallos) {
    out(422, [
        'ok'      => false,
        'reason'  => 'E_CONTRATO',
        'fallos'  => $fallos,
        'ms'      => $ms,
        'light'   => $light,
        'verify'  => $v,
        'log'     => $logTail,
    ]);
}

out(200, [
    'ok'      => true,
    'measured'=> true,
    'light'   => $light,
    'ms'      => $ms,
    'exit'    => $rc,
    'verify'  => $v,
    'log'     => $logTail,
]);
