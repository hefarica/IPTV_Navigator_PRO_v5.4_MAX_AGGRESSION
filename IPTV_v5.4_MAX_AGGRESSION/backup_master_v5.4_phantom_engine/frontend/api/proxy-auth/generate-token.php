<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔐 PROXY AUTH API - Generate Token Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * POST /api/proxy-auth/generate-token.php
 * Genera token JWT con credenciales de proxy cifradas (CAPA 7)
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    // Obtener datos de entrada
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        throw new Exception('No input data provided');
    }
    
    // Parámetros
    $channelId = $input['channel_id'] ?? 1;
    $deviceProfile = $input['device_profile'] ?? 'P3';
    $providerId = $input['provider_id'] ?? null;
    $streamPath = $input['stream_path'] ?? '/live/channel.m3u8';
    
    // Cargar servidor de proxy auth si existe
    $proxyAuthServerPath = __DIR__ . '/../../vps/proxy-auth-server.php';
    
    if (file_exists($proxyAuthServerPath)) {
        require_once $proxyAuthServerPath;
        $proxyAuthServer = new ProxyAuthenticationServer();
        
        // Generar token con proxy auth
        $result = $proxyAuthServer->generateStreamUrl(
            $channelId,
            $streamPath,
            $deviceProfile,
            $providerId
        );
    } else {
        // Fallback: generar token básico
        $result = [
            'url' => "https://iptv-ape.duckdns.org{$streamPath}",
            'token' => 'fallback_token_' . bin2hex(random_bytes(16)),
            'provider' => 'default',
            'expires' => time() + 86400
        ];
    }
    
    // Respuesta exitosa
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'data' => $result,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ]);
}
