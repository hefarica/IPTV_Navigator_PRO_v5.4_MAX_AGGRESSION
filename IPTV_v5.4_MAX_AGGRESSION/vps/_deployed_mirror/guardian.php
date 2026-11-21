<?php
/**
 * APE Guardian Engine v16 - Telemetry Proxy
 * Lee las estadísticas desde /dev/shm/guardian_exchange.json y las sirve con CORS
 * para el panel de Control en Gestor de Perfiles APE v9.0.
 */

// Evadir caché
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, must-revalidate');
header('Content-type: application/json');

// Parámetro de descarga histórica
$action = isset($_GET['action']) ? $_GET['action'] : 'rt';
$date = date('Y-m-d');
$historicalFile = '/dev/shm/ape_historical_global_' . $date . '.jsonL';

if ($action === 'download') {
    if (file_exists($historicalFile)) {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="ape_qos_historical_'.$date.'.jsonl"');
        readfile($historicalFile);
        exit;
    } else {
        echo "No history found for today.";
        exit;
    }
}

if ($action === 'history_table') {
    if (!file_exists($historicalFile)) {
        echo json_encode(['history' => []]);
        exit;
    }
    // Leer últimas 100 líneas rápidamente
    $lines = file($historicalFile);
    $last_lines = array_slice($lines, -100);
    $out = [];
    foreach($last_lines as $l) {
        $j = json_decode($l, true);
        if($j) $out[] = $j;
    }
    echo json_encode(['history' => array_reverse($out)]);
    exit;
}

$ramFile = '/dev/shm/guardian_exchange.json';

// Si no existe, creamos un payload simulado para el panel v16
if (!file_exists($ramFile)) {
    echo json_encode([
        'active_sessions' => 0,
        'avg_bandwidth_mbps' => 0.0,
        'avg_latency_ms' => 0,
        'total_errors' => 0,
        'suggestions' => [],
        'logs' => ['[System] Esperando telemetría desde resolve_quality_unified...']
    ]);
    exit;
}

// Para evitar problemas de concurrencia, lo leemos rápido
$content = @file_get_contents($ramFile);
if (!$content) {
    echo json_encode(['error' => 'No se pudo leer la telemetría']);
    exit;
}

// Apply decay: zero stale sessions before serving (> 30s without ping)
$state = json_decode($content, true);
if (is_array($state)) {
    $age = time() - ($state["last_update"] ?? 0);
    if ($age > 30) {
        $state["active_sessions"] = 0;
        $state["active_channels"] = [];
    }
    echo json_encode($state);
} else {
    echo $content;
}
