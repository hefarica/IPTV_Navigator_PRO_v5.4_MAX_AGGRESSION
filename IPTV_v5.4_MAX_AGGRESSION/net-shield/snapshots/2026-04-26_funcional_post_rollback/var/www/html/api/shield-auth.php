<?php
/**
 * NET SHIELD AUTH — valida token en URL /shield/TOKEN/...
 * Llamado por NGINX vía auth_request (internal subrequest)
 * Retorna 204 si token OK, 403 si inválido/expired/revoked
 */
header('Content-Type: application/json');

$registry_path = '/etc/net-shield/authorized_tokens.json';
$log_path = '/var/log/nginx/shield-auth.log';

// URI original: X-Original-URI header passa desde NGINX
$orig_uri = $_SERVER['HTTP_X_ORIGINAL_URI'] ?? '';
$orig_host = $_SERVER['HTTP_X_ORIGINAL_HOST'] ?? '';
$client_ip = $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '?';

// Extract token from URI: /shield/<TOKEN>/<HOST>/<PATH>
if (!preg_match('|^/shield/([a-f0-9]{32,96})/([^/]+)/(.*)$|', $orig_uri, $m)) {
    http_response_code(403);
    error_log(date('c') . " [shield-auth] INVALID_FORMAT ip=$client_ip uri=$orig_uri\n", 3, $log_path);
    echo json_encode(['error' => 'invalid_format']);
    exit;
}

$token = $m[1];
$target_host = $m[2];

// Load registry
if (!file_exists($registry_path)) {
    http_response_code(500);
    echo json_encode(['error' => 'registry_missing']);
    exit;
}

$registry = json_decode(@file_get_contents($registry_path), true);
if (!$registry || !isset($registry['tokens'][$token])) {
    http_response_code(403);
    error_log(date('c') . " [shield-auth] UNKNOWN_TOKEN ip=$client_ip token=" . substr($token, 0, 8) . "... host=$target_host\n", 3, $log_path);
    echo json_encode(['error' => 'unknown_token']);
    exit;
}

$entry = $registry['tokens'][$token];

// Check enabled
if (!($entry['enabled'] ?? false)) {
    http_response_code(403);
    error_log(date('c') . " [shield-auth] DISABLED ip=$client_ip token=" . substr($token, 0, 8) . "...\n", 3, $log_path);
    echo json_encode(['error' => 'token_disabled']);
    exit;
}

// Check expiry
$now = time();
$exp = strtotime($entry['expires'] ?? '1970-01-01');
if ($now > $exp) {
    http_response_code(403);
    error_log(date('c') . " [shield-auth] EXPIRED ip=$client_ip token=" . substr($token, 0, 8) . "...\n", 3, $log_path);
    echo json_encode(['error' => 'token_expired']);
    exit;
}

// Check allowed host
$allowed_hosts = $entry['allowed_hosts'] ?? [];
if (!in_array($target_host, $allowed_hosts, true)) {
    http_response_code(403);
    error_log(date('c') . " [shield-auth] HOST_NOT_ALLOWED ip=$client_ip token=" . substr($token, 0, 8) . "... host=$target_host\n", 3, $log_path);
    echo json_encode(['error' => 'host_not_allowed', 'host' => $target_host]);
    exit;
}

// Rate limit (simple count in /dev/shm per-token per-minute)
$rate_limit = $entry['rate_limit_req_min'] ?? 3600;
$rate_file = "/dev/shm/shield_rate_" . substr($token, 0, 16);
$current_min = (int)($now / 60);
$state = @json_decode(@file_get_contents($rate_file), true) ?: ['min' => 0, 'count' => 0];
if ($state['min'] === $current_min) {
    $state['count']++;
} else {
    $state = ['min' => $current_min, 'count' => 1];
}
@file_put_contents($rate_file, json_encode($state));
if ($state['count'] > $rate_limit) {
    http_response_code(429);
    error_log(date('c') . " [shield-auth] RATE_LIMIT ip=$client_ip token=" . substr($token, 0, 8) . "... count={$state['count']}\n", 3, $log_path);
    echo json_encode(['error' => 'rate_limit_exceeded']);
    exit;
}

// Log accepted access
error_log(date('c') . " [shield-auth] OK ip=$client_ip owner={$entry['owner']} host=$target_host count={$state['count']}\n", 3, $log_path);

// OK - NGINX procederá con proxy_pass
http_response_code(204);
header('X-Shield-Owner: ' . $entry['owner']);
header('X-Shield-Label: ' . $entry['label']);
exit;
