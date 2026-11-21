<?php

/**
 * 🛡️ APE ORIGIN HEALTH GUARDIAN v3.2 (Multi-Lista + Multi-Directorio)
 * 
 * PRINCIPIO: CERO HARDCODING. Los proveedores se leen dinámicamente
 * de TODOS los *.channels_map.json en TODOS los directorios relevantes:
 *   - /var/www/m3u8/  (directorio del resolver)
 *   - /mnt/data/iptv-lists/  (directorio donde upload.php guarda archivos)
 * 
 * CRON: * * * * * php /var/www/m3u8/origin_health_guardian.php > /dev/null 2>&1
 * 
 * SALIDA: /dev/shm/ape_guardian/providers_health.json
 */

declare(strict_types=1);

// ═══════════════════════════════════════════════════════════════════
// 🔌 LEER PROVEEDORES DE TODOS LOS *.channels_map.json (MULTI-DIRECTORIO)
// ═══════════════════════════════════════════════════════════════════
$providersRegistry = [];
$seenHosts = [];

$allMaps = [];
$scanDirs = [__DIR__, '/mnt/data/iptv-lists'];
foreach ($scanDirs as $dir) {
    if (!is_dir($dir)) continue;
    foreach (glob($dir . '/*.channels_map.json') as $f) $allMaps[] = $f;
    if (file_exists($dir . '/channels_map.json')) $allMaps[] = $dir . '/channels_map.json';
}
$allMaps = array_unique(array_map('realpath', array_filter($allMaps)));

foreach ($allMaps as $mapFile) {
    $mapData = @json_decode(@file_get_contents($mapFile), true);
    if (!is_array($mapData) || empty($mapData['providers'])) continue;
    $listId = $mapData['meta']['listId'] ?? basename($mapFile);
    foreach ($mapData['providers'] as $p) {
        $h = $p['host'] ?? '';
        if (empty($h) || empty($p['username']) || isset($seenHosts[$h])) continue;
        $seenHosts[$h] = true;
        $providersRegistry[] = [
            'host'    => $h,
            'user'    => $p['username'],
            'pass'    => $p['password'] ?? '',
            'list_id' => $listId,
        ];
    }
}

if (empty($providersRegistry)) {
    echo "No providers in any *.channels_map.json. Upload a list first.\n";
    exit(0);
}

// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════
$guardianDir = '/dev/shm/ape_guardian';
$healthFile  = $guardianDir . '/providers_health.json';
$healthLog   = $guardianDir . '/origins_health.log';

if (!is_dir($guardianDir)) {
    @mkdir($guardianDir, 0777, true);
}

// ═══════════════════════════════════════════════════════════════════
// PING INDIVIDUAL A CADA PROVEEDOR
// ═══════════════════════════════════════════════════════════════════
$healthMap = [];

foreach ($providersRegistry as $provider) {
    $host = $provider['host'];
    $user = $provider['user'];
    $pass = $provider['pass'];

    $probeUrl = "http://{$host}/player_api.php?username={$user}&password={$pass}";

    $start = microtime(true);
    $ch = curl_init($probeUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HTTPGET        => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    ]);

    $body    = curl_exec($ch);
    $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $timeMs  = (microtime(true) - $start) * 1000;
    $curlErr = curl_error($ch);
    curl_close($ch);

    $isHealthy = ($code >= 200 && $code < 400 && $body !== false && strlen($body) > 10);

    $status = 'DOWN';
    if ($isHealthy) {
        $status = 'UP';
    } elseif ($code === 403) {
        $status = 'BLOCKED';
    } elseif ($code === 0) {
        $status = 'TIMEOUT';
    }

    $healthMap[$host] = [
        'status'     => $status,
        'healthy'    => $isHealthy,
        'http_code'  => $code,
        'ping_ms'    => round($timeMs, 1),
        'list_id'    => $provider['list_id'],
        'last_check' => date('Y-m-d H:i:s'),
        'error'      => $curlErr ?: null,
    ];
}

// ═══════════════════════════════════════════════════════════════════
// PERSISTIR EN RAM-DISK
// ═══════════════════════════════════════════════════════════════════
file_put_contents($healthFile, json_encode($healthMap, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// Log legible
$provCount = count($providersRegistry);
$mapsCount = count($allMaps);
$logLine = date('[Y-m-d H:i:s]') . " ({$mapsCount} maps, {$provCount} providers) ";
foreach ($healthMap as $host => $data) {
    $logLine .= "[{$host}: {$data['status']} {$data['ping_ms']}ms] ";
}
file_put_contents($healthLog, $logLine . PHP_EOL, FILE_APPEND);

echo "Health Check v3.2 Completed ({$provCount} providers from {$mapsCount} maps across " . count($scanDirs) . " directories).\n";
