<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$hours = intval($data['hours'] ?? ($data['duration_hours'] ?? 8760));

// Escribimos en SHM (memoria compartida Linux) para alta velocidad si está disponible
$configFile = '/dev/shm/jwt_config.json';
if (!is_writable('/dev/shm')) {
    $configFile = sys_get_temp_dir() . '/jwt_config.json';
}

file_put_contents($configFile, json_encode(['hours' => $hours, 'ts' => time()]));

echo json_encode(['ok' => true, 'hours' => $hours, 'message' => 'JWT config updated successfully']);
