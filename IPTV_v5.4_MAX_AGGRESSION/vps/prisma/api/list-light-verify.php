<?php
/**
 * list-light-verify.php — verifica el CONTRATO de una lista LIGHT sin descargarla entera.
 *
 * Nace de un pedido explicito del operador: "agrega un checkbox para validar este tipo de
 * generacion de nueva lista, garantiza que se genere como debe ser".
 *
 * Lee el .gz (mas pequeno) en streaming y cuenta:
 *   canales        : lineas #EXTINF
 *   plantillas     : #EXT-X-APE-PROFILE-TEMPLATE en la CABECERA (antes del primer #EXTINF)
 *   ape_cuerpo     : #EXT-X-APE- despues del primer #EXTINF  (debe ser 0)
 *   tags           : #EXTSHIMOTT
 *   bytes / gz_bytes
 *   lineas_por_canal: lineas / canales  (la LIGHT son 6; las 1.046 del origen se
 *
 * FAIL-CLOSED: si no puede medir, devuelve 503 con `measured:false` y la razon.
 * NUNCA devuelve canales=0 como si fuera un dato: 0 y "no medido" son cosas distintas.
 *
 * Solo lectura. No escribe, no borra, no toca la lista.
 */

declare(strict_types=1);

const ALLOWED_DIR = '/var/www/lists';
const MAX_BYTES   = 268435456;   // 256 MiB de .gz descomprimido: tope de trabajo
const SAMPLE_CAP  = 400000;      // tope de lineas a recorrer (corta en seco, lo dice)

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-APE-Endpoint: list-light-verify/1.0.0');

function fail(int $code, string $reason, array $extra = []): void
{
    http_response_code($code);
    echo json_encode(array_merge([
        'ok'        => false,
        'measured'  => false,
        'reason'    => $reason,
    ], $extra), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$lista = isset($_GET['lista']) ? trim((string) $_GET['lista']) : '';
if ($lista === '') {
    fail(400, 'E_LISTA_REQUERIDA');
}

// Solo el nombre base: sin rutas, sin .., sin esquema.
if (!preg_match('/^[A-Za-z0-9._-]{1,180}$/', $lista)) {
    fail(400, 'E_LISTA_INVALIDA', ['lista' => $lista]);
}
if (strpos($lista, '..') !== false) {
    fail(400, 'E_LISTA_TRAVERSAL', ['lista' => $lista]);
}

$base = realpath(ALLOWED_DIR);
if ($base === false) {
    fail(500, 'E_DIR_AUSENTE', ['dir' => ALLOWED_DIR]);
}
$path = realpath($base . DIRECTORY_SEPARATOR . $lista);
if ($path === false || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0) {
    fail(404, 'E_LISTA_NO_EXISTE', ['lista' => $lista]);
}
if (!is_file($path) || !is_readable($path)) {
    fail(403, 'E_LISTA_NO_LEGIBLE', ['lista' => $lista]);
}

$bytes = (int) @filesize($path);

// Preferimos el .gz hermano (241 MB -> 13,7 MB). Si no hay, leemos el crudo.
$gz    = $path . '.gz';
$fuente = null;
$gzBytes = 0;
if (is_file($gz) && is_readable($gz)) {
    $fuente  = $gz;
    $gzBytes = (int) @filesize($gz);
    $fh = @gzopen($gz, 'rb');
} else {
    $fuente = $path;
    $fh = @fopen($path, 'rb');
}
if (!$fh) {
    fail(503, 'E_NO_ABRE', ['fuente' => basename($fuente)]);
}

$canales = 0;
$plantillas = 0;
$apeCuerpo = 0;
$tags = 0;
$lineas = 0;
$totalBytesLeidos = 0;
$enCuerpo = false;
$truncado = false;

while (true) {
    if ($lineas >= SAMPLE_CAP) { $truncado = true; break; }
    if ($totalBytesLeidos > MAX_BYTES) { $truncado = true; break; }

    $line = (strpos($fuente, '.gz') !== false) ? @gzgets($fh, 65536) : @fgets($fh, 65536);
    if ($line === false || $line === '') { break; }
    $lineas++;
    $totalBytesLeidos += strlen($line);

    if (strncmp($line, '#EXTINF', 7) === 0) {
        if (!$enCuerpo) { $enCuerpo = true; }
        $canales++;
        continue;
    }
    if (strncmp($line, '#EXT-X-APE-PROFILE-TEMPLATE:', 28) === 0) {
        $plantillas++;
        continue;
    }
    if (strncmp($line, '#EXTSHIMOTT:', 12) === 0) {
        $tags++;
        continue;
    }
    if ($enCuerpo && strncmp($line, '#EXT-X-APE-', 11) === 0) {
        $apeCuerpo++;
    }
}

(strpos($fuente, '.gz') !== false) ? @gzclose($fh) : @fclose($fh);

if ($lineas === 0) {
    fail(503, 'E_SIN_LINEAS', ['fuente' => basename($fuente), 'bytes' => $bytes]);
}

$lineasPorCanal = $canales > 0 ? (int) round($lineas / $canales) : null;

$out = [
    'ok'              => true,
    'measured'        => true,
    'lista'           => $lista,
    'bytes'           => $bytes,
    'gz_bytes'        => $gzBytes,
    'fuente'          => basename($fuente),
    'canales'         => $canales,
    'plantillas'      => $plantillas,
    'ape_cuerpo'      => $apeCuerpo,
    'tags'            => $tags,
    'lineas'          => $lineas,
    'lineas_por_canal'=> $lineasPorCanal,
    'truncado'        => $truncado,
    'measured_at'     => gmdate('Y-m-d\TH:i:s\Z'),
    'contrato'        => [
        'canalesMin'      => 20000,
        'plantillas'      => 9,
        'apeEnCuerpo'     => 0,
        'lineasPorCanal'  => 6,   // la LIGHT lleva 6; las 1.040 se RECUPERAN de las 9 plantillas
    ],
];
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
