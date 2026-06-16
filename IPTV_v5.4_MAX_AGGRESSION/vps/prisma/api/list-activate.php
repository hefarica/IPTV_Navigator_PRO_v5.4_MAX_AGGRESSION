<?php
/**
 * list-activate.php — URL-2 activation gate (F1.2)
 *
 * Dado el nombre/token de la lista que el player reproduce, comprueba la
 * MATRÍCULA (registered_lists). Si está registrada+activa → activa (marca
 * last_seen) y devuelve sus datos. Si no → passthrough (no procesa).
 *
 * ADITIVO. Servido por el location ~ \.php$ genérico (sin tocar nginx).
 * Solo lee/marca el registro; no expone secretos. Hardening de token: pendiente F1.x.
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
require __DIR__ . '/../lib/list_registry.php';

$file  = isset($_GET['file'])  ? basename($_GET['file'])  : (isset($_GET['list']) ? basename($_GET['list']) : '');
$token = isset($_GET['list_id']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['list_id']) : (isset($_GET['token']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['token']) : '');

$rec = null;
try {
    if ($file  !== '') $rec = lr_is_registered($file);
    if (!$rec && $token !== '') $rec = lr_lookup_by_token($token);
} catch (Exception $e) {
    http_response_code(200);
    echo json_encode(array('activated'=>false, 'error'=>'registry_unavailable'));
    exit;
}

if ($rec) {
    lr_mark_activation($rec['filename']);
    echo json_encode(array(
        'activated'     => true,
        'matricula'     => true,
        'filename'      => $rec['filename'],
        'list_id'       => $rec['list_id'],
        'variant'       => $rec['variant'],
        'channel_count' => (int)$rec['channel_count'],
        'status'        => $rec['status'],
    ));
} else {
    echo json_encode(array(
        'activated' => false,
        'matricula' => false,
        'reason'    => 'not_registered_passthrough',
    ));
}
