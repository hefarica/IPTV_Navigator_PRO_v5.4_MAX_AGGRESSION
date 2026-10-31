<?php
// Authenticated state publisher for ARA classifier. Auth BEFORE headers.
$want = 'Bearer ' . trim(@file_get_contents('/etc/ara/sse.token') ?: '');
$sent = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($want === 'Bearer ' || !hash_equals($want, $sent)) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo '{"error":"unauthorized"}';
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo '{"error":"invalid_json"}';
    exit;
}
$kind = isset($data['flags']['kind']) ? (string)$data['flags']['kind'] : '';
if (!in_array($kind, ['SLATE', 'FLAT', 'DETAIL', 'MOTION'], true)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo '{"error":"invalid_kind"}';
    exit;
}

try {
    $pdo = new PDO('sqlite:/var/lib/ara-x/events.db', null, null,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE IF NOT EXISTS m(seq INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT,ts INTEGER)');
    $payload = json_encode($data, JSON_UNESCAPED_SLASHES);
    $stmt = $pdo->prepare('INSERT INTO m(payload,ts) VALUES(?,?)');
    $stmt->execute([$payload, time()]);
    header('Content-Type: application/json');
    echo '{"ok":true,"seq":' . (int)$pdo->lastInsertId() . '}';
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo '{"error":"db_unavailable"}';
}
