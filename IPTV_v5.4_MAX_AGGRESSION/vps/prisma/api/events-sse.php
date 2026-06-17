<?php
declare(strict_types=1);

/**
 * /ara/events — SSE de deltas ARA/URL-2 sobre conviva.db (Council-safe cherry-pick).
 * Auth obligatoria (Bearer); 503 si ARA_TOKEN vacío en prod; APE_LAB_MODE=1 abre en lab.
 * NO acepta token por query string. Buffering off. Lee policy_deltas.
 * Funciones (ape_policy_db / ape_ara_heartbeat / ape_normalize_channel_id) viven en ape_mesh.php (append).
 */

require_once __DIR__ . '/../lib/ape_mesh.php';

function ara_sse_fail(int $code, string $msg): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('ok' => false, 'error' => $msg), JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

$lab = getenv('APE_LAB_MODE') === '1';
$token = getenv('ARA_TOKEN');
if (!$lab && (!is_string($token) || $token === '')) {
    ara_sse_fail(503, 'ARA_TOKEN_REQUIRED');
}
if (!$lab) {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/', $auth, $m) || !hash_equals((string)$token, (string)$m[1])) {
        ara_sse_fail(401, 'UNAUTHORIZED');
    }
}

$deviceId = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)($_GET['device_id'] ?? ''));
if ($deviceId === '') {
    ara_sse_fail(400, 'device_id_required');
}
$channelId = isset($_GET['channel_id']) ? ape_normalize_channel_id($_GET['channel_id']) : null;
$lastId = 0;
if (isset($_SERVER['HTTP_LAST_EVENT_ID']) && ctype_digit((string)$_SERVER['HTTP_LAST_EVENT_ID'])) {
    $lastId = (int)$_SERVER['HTTP_LAST_EVENT_ID'];
}
if (isset($_GET['last_id']) && ctype_digit((string)$_GET['last_id'])) {
    $lastId = max($lastId, (int)$_GET['last_id']);
}

ignore_user_abort(false);
@set_time_limit(0);
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', '0');

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-transform');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

while (ob_get_level() > 0) { @ob_end_flush(); }
@ob_implicit_flush(true);

$started = time();
$heartbeatEvery = 15;
$lastHeartbeat = 0;
$pdo = ape_policy_db();
ape_ara_heartbeat($deviceId, array('state' => 'SSE_CONNECTED', 'channel_id' => $channelId));

echo ": ara-events connected device={$deviceId}\n\n";
@flush();

while (!connection_aborted() && (time() - $started) < 3600) {
    $now = time();
    $params = array(':last' => $lastId, ':now' => $now, ':device' => $deviceId);
    $where = "id > :last AND (expires_at IS NULL OR expires_at >= :now)
              AND (target_device_id IS NULL OR target_device_id = '' OR target_device_id = '*' OR target_device_id = :device)";
    if ($channelId !== null && $channelId !== '') {
        $where .= " AND (channel_id IS NULL OR channel_id = '' OR channel_id = :channel)";
        $params[':channel'] = $channelId;
    }
    $stmt = $pdo->prepare("SELECT id, created_at, target_device_id, channel_id, delta_type, priority, payload_json, source
                          FROM policy_deltas WHERE {$where}
                          ORDER BY priority DESC, id ASC LIMIT 50");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as $row) {
        $lastId = max($lastId, (int)$row['id']);
        $payload = json_decode((string)$row['payload_json'], true);
        if (!is_array($payload)) { $payload = array('raw' => (string)$row['payload_json']); }
        $payload['id'] = (int)$row['id'];
        $payload['delta_type'] = (string)$row['delta_type'];
        $payload['channel_id'] = $row['channel_id'];
        $payload['source'] = $row['source'];
        echo "id: " . (int)$row['id'] . "\n";
        echo "event: policy.delta\n";
        echo "data: " . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";
    }
    if ($now - $lastHeartbeat >= $heartbeatEvery) {
        ape_ara_heartbeat($deviceId, array('state' => 'SSE_HEARTBEAT', 'channel_id' => $channelId));
        echo ": heartbeat " . $now . " last_id=" . $lastId . "\n\n";
        $lastHeartbeat = $now;
    }
    @flush();
    usleep(500000);
}

echo "event: ara.close\n";
echo "data: {\"ok\":true,\"reason\":\"server_rotation\",\"last_id\":{$lastId}}\n\n";
@flush();
