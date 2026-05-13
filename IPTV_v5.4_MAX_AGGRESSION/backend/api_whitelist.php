<?php
/**
 * ═══════════════════════════════════════════════════════════════════
 * APE WHITELIST API (DYNAMIC SSOT GENERATOR)
 * ═══════════════════════════════════════════════════════════════════
 * Este módulo recibe las peticiones desde el frontend (app.js) para
 * agregar dinámicamente nuevos servidores aprovisionados a la
 * Lista Blanca sin alterar el archivo nativo ape_credentials.php.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
    exit;
}

$inputJSON = file_get_contents('php://input');
$data = json_decode($inputJSON, true);

if (!isset($data['host']) || !isset($data['user']) || !isset($data['pass'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
    exit;
}

// 1. Sanitizar
$rawHost = filter_var($data['host'], FILTER_SANITIZE_URL);
$cleanHost = preg_replace('#^https?://#', '', rtrim($rawHost, '/'));
// Remueve posibles puertos si el host lo trae, o lo deja limpio para Xtream Codes
$cleanHost = explode(':', $cleanHost)[0]; 

$user = trim($data['user']);
$pass = trim($data['pass']);

if (empty($cleanHost) || empty($user) || empty($pass)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid data provided']);
    exit;
}

// 2. Leer o Inicializar whitelist dinámica
$whitelistFile = __DIR__ . '/whitelist_dynamic.json';
$whitelist = [];

if (file_exists($whitelistFile)) {
    $content = file_get_contents($whitelistFile);
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $whitelist = $decoded;
    }
}

// 3. Inyectar / Sobrescribir el servidor en la memoria del array
$whitelist[$cleanHost] = [
    'user' => $user,
    'pass' => $pass
];

// 4. Guardar atómicamente
$jsonOutput = json_encode($whitelist, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
$bytes = file_put_contents($whitelistFile, $jsonOutput, LOCK_EX);

if ($bytes === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to write whitelist file. Check permissions.']);
    exit;
}

// 5. Success
echo json_encode([
    'status' => 'success',
    'message' => 'Server whitelisted successfully',
    'data' => [
        'host' => $cleanHost
    ]
]);
exit;
