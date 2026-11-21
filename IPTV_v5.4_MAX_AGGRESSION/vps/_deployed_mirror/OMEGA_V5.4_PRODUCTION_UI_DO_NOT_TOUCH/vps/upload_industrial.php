<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-File-Name, X-Upload-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
set_time_limit(0);
ignore_user_abort(true);

function fail(int $code, string $msg, array $extra = []) {
    http_response_code($code);
    echo json_encode(['success'=>false,'error'=>$msg,'extra'=>$extra], JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if (!isset($_FILES['file'])) {
        fail(400, 'missing_file_field', ['expected'=>'file']);
    }

    $f = $_FILES['file'];

    if (!empty($f['error']) && $f['error'] !== UPLOAD_ERR_OK) {
        fail(400, 'php_upload_error', ['code'=>$f['error']]);
    }

    $origName = $f['name'] ?? 'unknown.m3u8';
    $safeName = preg_replace('/[^a-zA-Z0-9._() -]+/', '_', basename($origName));
    if (!$safeName) $safeName = 'upload_' . time() . '.m3u8';

    $tmp = $f['tmp_name'];
    if (!is_uploaded_file($tmp)) {
        fail(400, 'tmp_not_uploaded_file', ['tmp'=>$tmp]);
    }

    $destDir = '/var/www/lists/';
    if (!is_dir($destDir)) {
        fail(500, 'dest_dir_missing', ['destDir'=>$destDir]);
    }
    if (!is_writable($destDir)) {
        fail(500, 'dest_dir_not_writable', ['destDir'=>$destDir]);
    }

    $destPath = $destDir . $safeName;

    if (!move_uploaded_file($tmp, $destPath)) {
        fail(500, 'move_uploaded_file_failed', ['destPath'=>$destPath,'tmp'=>$tmp]);
    }

    @chmod($destPath, 0644);

    echo json_encode([
        'success'=>true,
        'filename'=>$safeName,
        'bytes'=>filesize($destPath),
        'url'=>'https://iptv-ape.duckdns.org/lists/'.$safeName,
        'hintedUrl'=>'https://iptv-ape.duckdns.org/lists/'.rawurlencode($safeName)
    ], JSON_UNESCAPED_SLASHES);
    exit;

} catch (Throwable $e) {
    error_log('[UPLOAD_FATAL] '.$e->getMessage().' | '.$e->getFile().':'.$e->getLine());
    fail(500, 'fatal_exception', ['msg'=>$e->getMessage()]);
}
