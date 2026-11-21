<?php
// /api/health — enhanced 2026-04-25 tras incidente freeze
// Backwards-compat: top-level status/service/version/ts mantienen formato
// Nuevo: detail{} con métricas para dashboard y monitoreo

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

// ---------- Helpers ----------
function read_json_file($path) {
    if (!is_readable($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $j = @json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function read_first_line($path) {
    if (!is_readable($path)) return null;
    $f = @fopen($path, 'r');
    if (!$f) return null;
    $line = trim(fgets($f) ?: '');
    fclose($f);
    return $line === '' ? null : $line;
}

function dir_size_bytes($dir) {
    if (!is_dir($dir)) return 0;
    $total = 0;
    try {
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($iter as $f) { if ($f->isFile()) $total += $f->getSize(); }
    } catch (Throwable $e) {}
    return $total;
}

function dir_file_count($dir) {
    if (!is_dir($dir)) return 0;
    $n = 0;
    try {
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($iter as $f) { if ($f->isFile()) $n++; }
    } catch (Throwable $e) {}
    return $n;
}

// ---------- Cache health ----------
$cache_metrics = read_json_file('/dev/shm/cache_health_metrics.json');
$cache_files = $cache_metrics['cache_files'] ?? dir_file_count('/dev/shm/nginx_cache');
$cache_size  = $cache_metrics['cache_size_bytes'] ?? dir_size_bytes('/dev/shm/nginx_cache');
$cache_status = $cache_metrics['status'] ?? 'unknown';
$cache_reqs_5m = $cache_metrics['requests_5min'] ?? 0;

// ---------- Memory ----------
$meminfo = @file_get_contents('/proc/meminfo') ?: '';
$mem_total_kb = 0; $mem_avail_kb = 0; $mem_free_kb = 0;
if (preg_match('/MemTotal:\s+(\d+)/', $meminfo, $m)) $mem_total_kb = (int)$m[1];
if (preg_match('/MemAvailable:\s+(\d+)/', $meminfo, $m)) $mem_avail_kb = (int)$m[1];
if (preg_match('/MemFree:\s+(\d+)/', $meminfo, $m)) $mem_free_kb = (int)$m[1];

// ---------- Net Shield (unbound, peers, surfshark) ----------
$net_shield = read_json_file('/dev/shm/net_shield_metrics.json');
$peer_metrics = read_json_file('/dev/shm/wg_peer_audit.json');
$surf_state = read_first_line('/var/run/surfshark-failover.state');
$surf_fails = read_first_line('/var/run/surfshark-failover.fails');

// ---------- Dead channels blacklist ----------
$dead_count = 0;
if (is_readable('/etc/net-shield/dead_channels.txt')) {
    $dead_count = count(file('/etc/net-shield/dead_channels.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
}

// ---------- Memory pressure ----------
$mem_pressure = read_json_file('/dev/shm/mem_pressure.json');

// ---------- Determinar status global ----------
$status = 'ok';
$warnings = [];
$mem_available_mb = (int)round($mem_avail_kb / 1024);

if ($cache_status === 'EMPTY_RESTARTING') { $status = 'critical'; $warnings[] = 'cache_restart_triggered'; }
elseif ($cache_status === 'EMPTY_WITH_TRAFFIC' && $cache_reqs_5m > 50) { $status = 'warning'; $warnings[] = 'cache_empty_with_traffic'; }
if ($mem_available_mb < 200) { $status = ($status === 'ok') ? 'warning' : $status; $warnings[] = 'low_memory'; }
if (($peer_metrics['unauthorized_count'] ?? 0) > 0) { $status = ($status === 'ok') ? 'warning' : $status; $warnings[] = 'unauthorized_wg_peer'; }
if (($mem_pressure['triggered'] ?? false)) { $status = ($status === 'ok') ? 'warning' : $status; $warnings[] = 'memory_pressure'; }

// ---------- Output ----------
echo json_encode([
    'status'  => $status,
    'service' => 'IPTV-APE VPS',
    'version' => '6.3.0',
    'ts'      => date('c'),
    'warnings' => $warnings,
    'detail'  => [
        'cache' => [
            'path' => '/dev/shm/nginx_cache',
            'files' => $cache_files,
            'size_bytes' => $cache_size,
            'size_mb' => round($cache_size / 1048576, 2),
            'status' => $cache_status,
            'requests_5min' => $cache_reqs_5m,
        ],
        'memory' => [
            'total_mb' => (int)round($mem_total_kb / 1024),
            'available_mb' => $mem_available_mb,
            'free_mb' => (int)round($mem_free_kb / 1024),
            'pressure_triggered' => $mem_pressure['triggered'] ?? false,
        ],
        'net_shield' => [
            'unbound_metrics_age_s' => isset($net_shield['ts']) ? max(0, time() - strtotime($net_shield['ts'])) : null,
            'wg_peer_count' => $peer_metrics['peer_count'] ?? null,
            'wg_authorized_count' => $peer_metrics['authorized_count'] ?? null,
            'wg_unauthorized_count' => $peer_metrics['unauthorized_count'] ?? 0,
            'wg_max_handshake_age_s' => $peer_metrics['max_handshake_age_s'] ?? null,
            'surfshark_state' => $surf_state,
            'surfshark_consecutive_fails' => $surf_fails !== null ? (int)$surf_fails : null,
        ],
        'blacklist' => [
            'dead_channels_count' => $dead_count,
        ],
    ],
], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
