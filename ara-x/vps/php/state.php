<?php
// Authenticated state publisher for ARA classifier. Auth BEFORE headers.
// [2026-11-05] El APK exige que el Bearer de /ara/events y el token SSE de
// /ara/state sean DISTINTOS. /ara/state acepta cualquiera de los dos:
//   - /etc/ara/sse.token   (compatibilidad con clientes ya configurados)
//   - /etc/ara/state.token (token SSE dedicado, recomendado en la UI)
$sent = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$accept = [];
foreach (['/etc/ara/sse.token', '/etc/ara/state.token'] as $tf) {
    $v = trim(@file_get_contents($tf) ?: '');
    if ($v !== '') { $accept[] = 'Bearer ' . $v; }
}
$ok = false;
foreach ($accept as $want) { if (hash_equals($want, $sent)) { $ok = true; break; } }
if (!$accept || !$ok) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo '{"error":"unauthorized"}';
    exit;
}

require_once __DIR__ . '/state_bridge.php';

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
    $seq = (int)$pdo->lastInsertId();
    $sseSeq = null;
    try {
        $sseSeq = ApeStateBridge::append($data);
    } catch (Throwable $e) {
        // State remains persisted in m even if the SSE bridge DB is unavailable.
    }
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'seq' => $seq, 'sse_seq' => $sseSeq], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo '{"error":"db_unavailable"}';
}

