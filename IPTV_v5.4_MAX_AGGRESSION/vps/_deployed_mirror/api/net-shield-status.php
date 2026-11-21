<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: *');
$files = [
    'metrics' => '/dev/shm/net_shield_metrics.json',
    'throughput' => '/dev/shm/net_shield_throughput.json',
    'quality' => '/dev/shm/iptv_quality.json',
    'prefetcher' => '/dev/shm/iptv_prefetcher.json',
];
$out = [];
$base = null;
foreach ($files as $k => $p) {
    if (file_exists($p)) {
        $d = json_decode(file_get_contents($p), true);
        if ($k === 'metrics' && $d) { $base = $d; $out = $d; }
        else $out[$k] = $d;
    }
}
$out['age_seconds'] = $base ? max(0, time() - filemtime('/dev/shm/net_shield_metrics.json')) : 999;
$out['stale'] = $out['age_seconds'] > 30;
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
