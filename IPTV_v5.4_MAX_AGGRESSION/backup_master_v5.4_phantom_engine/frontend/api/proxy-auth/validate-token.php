<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 PROXY AUTH API - Validate Token Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * POST /api/proxy-auth/validate-token.php
 * Valida un token JWT y verifica sus credenciales de proxy
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
    
    if (!$input || !isset($input['token'])) {
        throw new Exception('Token not provided');
    }
    
    $token = $input['token'];
    
    // Cargar servidor de proxy auth si existe
    $proxyAuthServerPath = __DIR__ . '/../../vps/proxy-auth-server.php';
    
    if (file_exists($proxyAuthServerPath)) {
        require_once $proxyAuthServerPath;
        $proxyAuthServer = new ProxyAuthenticationServer();
        
        // Validar token
        $isValid = $proxyAuthServer->validateToken($token);
        $decoded = $isValid ? $proxyAuthServer->decodeToken($token) : null;
    } else {
        // Fallback: validación básica
        $parts = explode('.', $token);
        $isValid = count($parts) === 3;
        
        if ($isValid && isset($parts[1])) {
            $payload = json_decode(base64_decode($parts[1]), true);
            $decoded = $payload;
            
            // Verificar expiración
            if (isset($payload['exp']) && $payload['exp'] < time()) {
                $isValid = false;
            }
        } else {
            $decoded = null;
        }
    }
    
    // Respuesta
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'valid' => $isValid,
        'decoded' => $decoded,
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
