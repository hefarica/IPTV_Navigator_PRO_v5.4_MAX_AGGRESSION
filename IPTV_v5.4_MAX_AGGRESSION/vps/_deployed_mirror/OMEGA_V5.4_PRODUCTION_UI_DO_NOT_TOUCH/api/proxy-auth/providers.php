<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 PROXY AUTH API - Providers Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * GET /api/proxy-auth/providers.php
 * Lista todos los providers IPTV disponibles
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    // Cargar servidor de proxy auth si existe
    $proxyAuthServerPath = __DIR__ . '/../../vps/proxy-auth-server.php';
    
    if (file_exists($proxyAuthServerPath)) {
        require_once $proxyAuthServerPath;
        $proxyAuthServer = new ProxyAuthenticationServer();
        
        // Obtener providers disponibles
        $providers = $proxyAuthServer->getAvailableProviders();
    } else {
        // Fallback: providers de ejemplo
        $providers = [
            [
                'id' => 'provider_1',
                'name' => 'Provider Premium',
                'domain' => 'premium.iptv.net',
                'priority' => 1,
                'enabled' => true,
                'status' => 'online'
            ],
            [
                'id' => 'provider_2',
                'name' => 'Provider Standard',
                'domain' => 'standard.iptv.net',
                'priority' => 2,
                'enabled' => true,
                'status' => 'online'
            ],
            [
                'id' => 'provider_3',
                'name' => 'Provider Backup',
                'domain' => 'backup.iptv.net',
                'priority' => 3,
                'enabled' => true,
                'status' => 'standby'
            ]
        ];
    }
    
    // Respuesta exitosa
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'count' => count($providers),
        'providers' => $providers,
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
