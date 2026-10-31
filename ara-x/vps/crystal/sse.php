<?php
// SSE metadata stream for ARA. Auth is checked BEFORE any SSE header.
$tokFile = '/etc/ara/sse.token';
$want = 'Bearer ' . trim(@file_get_contents($tokFile) ?: '');
$sent = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($want === 'Bearer ' || !hash_equals($want, $sent)) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo '{"error":"unauthorized"}';
    exit;
}

$DB = '/var/lib/ara-x/events.db';
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache, no-transform');
header('X-Accel-Buffering: no');
header('Connection: keep-alive');
@ob_end_flush();
flush();

try {
    $pdo = new PDO('sqlite:' . $DB, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE IF NOT EXISTS m(seq INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT,ts INTEGER)');
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo '{"error":"db_unavailable"}';
    exit;
}

$last = (int)($_GET['seq'] ?? 0);
$deadline = microtime(true) + 300;
while (microtime(true) < $deadline) {
    if (connection_aborted()) break;
    $stmt = $pdo->prepare('SELECT seq,payload FROM m WHERE seq > ? ORDER BY seq LIMIT 20');
    $stmt->execute([$last]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $last = (int)$r['seq'];
        echo "id: {$last}\n";
        echo "data: {$r['payload']}\n\n";
        @flush();
    }
    echo ": hb\n\n";
    @flush();
    usleep(1_000_000);
}
