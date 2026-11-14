<?php
/**
 * list-cablear-status.php — ESTADO de un ticket de cableado (contrato t59, §status_endpoint).
 *
 *   GET /prisma/api/list-cablear-status.php?ticket=t-...   (el ticket exacto)
 *   GET /prisma/api/cablear-estado.php?ticket=...         (mismo endpoint; path del contrato)
 *   GET ...?ultimos=N     (1..50) -> los N mas recientes
 *   GET ...?lista=<nombre>        -> ultimo ticket de esa lista (reenganche)
 *
 * Exactamente uno de los tres; cero o dos -> 400 E_CONSULTA_AMBIGUA.
 * Estados: queued · running · done · failed · skipped_disk · expired(410).
 * En done y con publicada=true trae salida.url_cableada (la URL exacta que el
 * operador copia); con publicar=0 viene null a proposito (invariante I3).
 *
 * Toda la logica esta en list_cablear_core.php (probada sin VPS ni disco).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__ . '/list_cablear_core.php';

function ape_cablear_emitir($http, array $body)
{
    http_response_code($http);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/* Misma clave opcional que el encolado: leer el estado de un trabajo ajeno no
 * deberia ser mas facil que encolarlo. */
$__key = getenv('APE_CABLEAR_KEY');
if ($__key === false || $__key === '') {
    $__kf = '/etc/ape/cablear.key';
    if (is_file($__kf) && is_readable($__kf)) {
        $__v = trim((string) @file_get_contents($__kf));
        if ($__v !== '') { $__key = $__v; }
    }
}
if (is_string($__key) && $__key !== '') {
    $__got = isset($_SERVER['HTTP_X_APE_KEY']) ? (string) $_SERVER['HTTP_X_APE_KEY'] : '';
    if ($__got === '' || !hash_equals($__key, $__got)) {
        ape_cablear_emitir(401, array(
            'ok' => false, 'error' => 'E_NO_AUTORIZADO',
            'motivo' => 'falta X-APE-Key valida',
        ));
    }
}

$__metodo = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
if ($__metodo !== 'GET' && $__metodo !== 'HEAD') {
    header('Allow: GET');
    ape_cablear_emitir(405, array(
        'ok' => false, 'error' => 'E_METODO_NO_PERMITIDO',
        'motivo' => 'este endpoint solo acepta GET',
    ));
}

$q = array(
    'ticket'  => isset($_GET['ticket']) ? (string) $_GET['ticket'] : '',
    'ultimos' => isset($_GET['ultimos']) ? (string) $_GET['ultimos'] : '',
    'lista'   => isset($_GET['lista']) ? (string) $_GET['lista'] : '',
);

$io = ape_cablear_io();
$res = ape_cablear_status($q, $io);

if (isset($res['body']) && is_array($res['body'])) {
    $res['body']['auth'] = (is_string($__key) && $__key !== '') ? 'x-ape-key' : 'heredada';
}

ape_cablear_emitir($res['http'], $res['body']);
