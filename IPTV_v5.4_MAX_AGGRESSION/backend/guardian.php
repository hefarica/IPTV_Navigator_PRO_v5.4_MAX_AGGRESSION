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

echo $content;
