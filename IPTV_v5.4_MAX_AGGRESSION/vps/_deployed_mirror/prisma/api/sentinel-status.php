<?php
/**
 * sentinel-status.php — estado del centinela del device.
 *
 * POR QUE EXISTE
 *   Medido el 2026-11-15: 141 peticiones a /prisma/api/sentinel-status devolvian 404,
 *   del DEVICE (181.130.154.235). El centinela (ape-sentinel.sh) corre en el device;
 *   este endpoint es el PUNTO DE RECEPCION de su latido: si el device lo empuja, aqui
 *   se guarda y se sirve. Si nunca ha empujado, se dice, no se finge un "ok".
 *
 * CONTRATO
 *   GET  ?                          -> ultimo latido sellado (o {"seen":false})
 *   POST body JSON                   -> guarda el latido (campos libres; se guarda tal cual)
 *   El fichero vive en /var/lib/ape/sentinel-status.json (no en /var/www para no servirlo
 *   por accidente) y se escribe de forma atomica (tmp + rename).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$store = '/var/lib/ape/sentinel-status.json';
$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';

if ($method === 'POST') {
    $raw = @file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        http_response_code(400);
        echo json_encode(array('ok' => false, 'error' => 'body vacio'));
        exit;
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        http_response_code(400);
        echo json_encode(array('ok' => false, 'error' => 'body no es JSON'));
        exit;
    }
    // Limite duro: un latido no pesa mas de 64 KB. Mas que eso es abuso, no telemetria.
    if (strlen($raw) > 65536) {
        http_response_code(413);
        echo json_encode(array('ok' => false, 'error' => 'body > 64 KB'));
        exit;
    }
    $j['_received_at'] = gmdate('c');
    $j['_remote'] = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null;
    $dir = dirname($store);
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $tmp = $store . '.tmp.' . getmypid();
    if (@file_put_contents($tmp, json_encode($j, JSON_UNESCAPED_SLASHES)) === false) {
        http_response_code(500);
        echo json_encode(array('ok' => false, 'error' => 'no se pudo escribir el latido'));
        exit;
    }
    if (!@rename($tmp, $store)) {
        @unlink($tmp);
        http_response_code(500);
        echo json_encode(array('ok' => false, 'error' => 'no se pudo instalar el latido'));
        exit;
    }
    echo json_encode(array('ok' => true, 'stored' => true, 'bytes' => strlen($raw))), "\n";
    exit;
}

// GET
if (!is_file($store)) {
    echo json_encode(array(
        'seen'    => false,
        'reason'  => 'el device no ha empujado ningun latido a este endpoint todavia',
        'store'   => $store,
        'hint'    => 'POST JSON aqui desde ape-sentinel.sh en el device',
    ), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
    exit;
}
$raw = @file_get_contents($store);
$j = json_decode((string)$raw, true);
if (!is_array($j)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'error' => 'estado corrupto', 'bytes' => strlen((string)$raw)));
    exit;
}
$j['seen'] = true;
$j['_age_s'] = max(0, time() - (int)@filemtime($store));
echo json_encode($j, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";