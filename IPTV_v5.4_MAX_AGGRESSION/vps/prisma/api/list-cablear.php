<?php
/**
 * list-cablear.php — ENCOLADO de una lista para cablear (contrato t59, §enqueue_endpoint).
 *
 *   POST /prisma/api/list-cablear.php        (forma x-www-form-urlencoded)
 *   POST /prisma/api/cablear.php             (mismo endpoint; el contrato fija este path)
 *
 * Campos: lista (obligatorio) · publicar (0|1, def. 0) · device (opcional) · forzar (0|1, def. 0)
 * Respuestas: 202 queued · 200 duplicado (mismo ticket) · 4xx/5xx con el codigo del contrato.
 *
 * La logica NO vive aqui: vive en list_cablear_core.php, que es puro y se puede
 * probar sin VPS, sin red y sin disco (tools/quality/test_list_cablear_panel.js).
 * Este fichero solo: (1) exige POST, (2) aplica la clave opcional, (3) emite.
 *
 * AUTH (contrato: "se hereda, no se define"): si APE_CABLEAR_KEY esta definida
 * (env o fichero), se exige la cabecera X-APE-Key con hash_equals -> 401
 * E_NO_AUTORIZADO. Si no esta definida, el endpoint confia en la capa que
 * tenga delante y lo DECLARA en la respuesta (auth:"heredada"), que es
 * exactamente lo que dice el contrato: no inventa un esquema nuevo.
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

/* ── claves opcionales ───────────────────────────────────────────────────── */
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

/* ── metodo (validacion 1 del contrato, aplicada antes de leer el cuerpo) ── */
$__metodo = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
if ($__metodo !== 'POST') {
    header('Allow: POST');
    ape_cablear_emitir(405, array(
        'ok' => false, 'error' => 'E_METODO_NO_PERMITIDO',
        'motivo' => 'este endpoint solo acepta POST x-www-form-urlencoded',
    ));
}

/* ── entrada ─────────────────────────────────────────────────────────────── */
$in = array(
    'lista'    => isset($_POST['lista']) ? (string) $_POST['lista'] : '',
    'publicar' => isset($_POST['publicar']) ? (string) $_POST['publicar'] : '0',
    'device'   => isset($_POST['device']) ? (string) $_POST['device'] : '',
    'forzar'   => isset($_POST['forzar']) ? (string) $_POST['forzar'] : '0',
    '_method'  => $__metodo,
);

$io = ape_cablear_io();
$res = ape_cablear_enqueue($in, $io);

/* Se declara como se ejercio la auth: el contrato dice que se hereda, no que
 * se invente. Decirlo en la respuesta evita que parezca que hay auth propia. */
if (isset($res['body']) && is_array($res['body'])) {
    $res['body']['auth'] = (is_string($__key) && $__key !== '') ? 'x-ape-key' : 'heredada';
}

ape_cablear_emitir($res['http'], $res['body']);
