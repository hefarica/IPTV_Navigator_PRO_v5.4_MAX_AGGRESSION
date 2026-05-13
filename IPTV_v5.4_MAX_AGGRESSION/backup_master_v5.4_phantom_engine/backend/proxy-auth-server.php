<?php
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                 PROXY AUTHENTICATION SERVER MODULE v2.0                   ║
 * ║                  APE ULTIMATE - DYNAMIC IPTV PROVIDERS                    ║
 * ║                                                                           ║
 * ║  Generación de tokens con credenciales de proxy cifradas                 ║
 * ║  Manejo de múltiples proveedores IPTV preseleccionados                   ║
 * ║  Cifrado: AES-256-GCM para credenciales                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

class ProxyAuthenticationServer {
    
    private $encryptionKey;
    private $providers = [];
    private $tokenExpiration = 86400; // 24 horas
    private $jwtSecret;
    private $algorithm = 'HS256';
    
    /**
     * Constructor
     */
    public function __construct($encryptionKey = null, $jwtSecret = null) {
        $this->encryptionKey = $encryptionKey ?? getenv('PROXY_ENCRYPTION_KEY') ?? 'default-key-change-in-production';
        $this->jwtSecret = $jwtSecret ?? getenv('JWT_SECRET') ?? 'jwt-secret-change-in-production';
        
        // Inicializar proveedores preseleccionados
        $this->initializeProviders();
    }
    
    /**
     * PASO 1: Inicializar proveedores IPTV preseleccionados
     */
    private function initializeProviders() {
        // Cargar desde configuración o base de datos
        $this->providers = [
            [
                'id' => 'provider_1',
                'name' => 'Provider Premium',
                'domain' => 'premium.iptv.net',
                'proxy_host' => 'proxy1.iptv.net',
                'proxy_port' => 8080,
                'proxy_user' => 'user_premium',
                'proxy_pass' => 'pass_premium',
                'proxy_auth_type' => 'basic',
                'priority' => 1,
                'enabled' => true
            ],
            [
                'id' => 'provider_2',
                'name' => 'Provider Standard',
                'domain' => 'standard.iptv.net',
                'proxy_host' => 'proxy2.iptv.net',
                'proxy_port' => 3128,
                'proxy_user' => 'user_standard',
                'proxy_pass' => 'pass_standard',
                'proxy_auth_type' => 'ntlm',
                'priority' => 2,
                'enabled' => true
            ],
            [
                'id' => 'provider_3',
                'name' => 'Provider Backup',
                'domain' => 'backup.iptv.net',
                'proxy_host' => 'proxy3.iptv.net',
                'proxy_port' => 8888,
                'proxy_user' => 'user_backup',
                'proxy_pass' => 'pass_backup',
                'proxy_auth_type' => 'digest',
                'priority' => 3,
                'enabled' => true
            ]
        ];
    }
    
    /**
     * PASO 2: Seleccionar provider dinámicamente
     */
    public function selectProvider($deviceId = null, $preferredProvider = null) {
        // Filtrar proveedores habilitados
        $enabledProviders = array_filter($this->providers, function($p) {
            return $p['enabled'] === true;
        });
        
        // Ordenar por prioridad
        usort($enabledProviders, function($a, $b) {
            return $a['priority'] - $b['priority'];
        });
        
        if (empty($enabledProviders)) {
            throw new Exception('No hay proveedores disponibles');
        }
        
        // Si hay preferencia, intentar usar esa
        if ($preferredProvider) {
            foreach ($enabledProviders as $provider) {
                if ($provider['id'] === $preferredProvider) {
                    return $provider;
                }
            }
        }
        
        // Seleccionar por defecto (primera con mayor prioridad)
        return $enabledProviders[0];
    }
    
    /**
     * PASO 3: Generar token JWT con credenciales de proxy cifradas
     */
    public function generateTokenWithProxyAuth($channelId, $deviceProfile = 'P3', $provider = null) {
        
        // Seleccionar provider
        if (!$provider) {
            $provider = $this->selectProvider();
        }
        
        // Cifrar credenciales de proxy
        $encryptedUser = $this->encryptCredential($provider['proxy_user']);
        $encryptedPass = $this->encryptCredential($provider['proxy_pass']);
        
        // Construir payload del JWT
        $payload = [
            // Metadatos estándares
            'iss' => 'APE_v16.0.0-ULTIMATE-TYPED-ARRAYS',
            'iat' => time(),
            'exp' => time() + $this->tokenExpiration,
            'nbf' => time() - 60,
            'jti' => 'jti_' . $this->generateRandomId(),
            'nonce' => bin2hex(random_bytes(16)),
            
            // Información del canal
            'sub' => $channelId,
            'chn_id' => $channelId,
            
            // Perfil de dispositivo
            'device_profile' => $deviceProfile,
            
            // NUEVA CAPA 7: AUTENTICACIÓN DE PROXY
            'proxy_enabled' => true,
            'proxy_host' => $provider['proxy_host'],
            'proxy_port' => $provider['proxy_port'],
            'proxy_user' => $encryptedUser,
            'proxy_pass' => $encryptedPass,
            'proxy_auth_type' => $provider['proxy_auth_type'],
            'proxy_realm' => 'Proxy',
            'proxy_domain' => $provider['domain'],
            'proxy_key' => $this->generateProxyKey(),
            'proxy_retry_407' => true,
            'proxy_max_retries' => 3,
            'proxy_retry_delay' => 1000,
            
            // Provider información
            'provider_id' => $provider['id'],
            'provider_name' => $provider['name'],
            'provider_domain' => $provider['domain'],
            
            // Metadata
            'version' => '16.0.0-ULTIMATE-TYPED-ARRAYS',
            'architecture' => 'TYPED_ARRAYS_ULTIMATE',
            'src' => 'ape_typed_arrays_68plus'
        ];
        
        // Generar JWT
        $token = $this->generateJWT($payload);
        
        return [
            'token' => $token,
            'provider' => $provider['id'],
            'provider_name' => $provider['name'],
            'proxy_host' => $provider['proxy_host'],
            'proxy_port' => $provider['proxy_port'],
            'auth_type' => $provider['proxy_auth_type'],
            'expires_in' => $this->tokenExpiration
        ];
    }
    
    /**
     * PASO 4: Cifrar credencial individual
     */
    private function encryptCredential($plaintext) {
        try {
            // Usar AES-256-GCM
            $algorithm = 'aes-256-gcm';
            $iv = openssl_random_pseudo_bytes(12); // 96 bits para GCM
            $tag = '';
            
            $encrypted = openssl_encrypt(
                $plaintext,
                $algorithm,
                $this->encryptionKey,
                OPENSSL_RAW_DATA,
                $iv,
                $tag
            );
            
            // Retornar: iv + tag + encrypted (todo en base64)
            $result = base64_encode($iv . $tag . $encrypted);
            
            return $result;
            
        } catch (Exception $e) {
            error_log('Error cifrando credencial: ' . $e->getMessage());
            return null;
        }
    }
    
    /**
     * PASO 5: Desencriptar credencial (para verificación)
     */
    public function decryptCredential($encrypted) {
        try {
            $algorithm = 'aes-256-gcm';
            
            // Decodificar base64
            $data = base64_decode($encrypted);
            
            // Extraer componentes
            $iv = substr($data, 0, 12);
            $tag = substr($data, 12, 16);
            $ciphertext = substr($data, 28);
            
            // Desencriptar
            $plaintext = openssl_decrypt(
                $ciphertext,
                $algorithm,
                $this->encryptionKey,
                OPENSSL_RAW_DATA,
                $iv,
                $tag
            );
            
            return $plaintext;
            
        } catch (Exception $e) {
            error_log('Error desencriptando credencial: ' . $e->getMessage());
            return null;
        }
    }
    
    /**
     * PASO 6: Generar JWT con firma
     */
    private function generateJWT($payload) {
        // Header
        $header = [
            'alg' => $this->algorithm,
            'typ' => 'JWT',
            'ver' => '16.0.0-ULTIMATE-TYPED-ARRAYS'
        ];
        
        // Codificar header y payload
        $headerEncoded = $this->base64UrlEncode(json_encode($header));
        $payloadEncoded = $this->base64UrlEncode(json_encode($payload));
        
        // Crear firma
        $signature = hash_hmac(
            'sha256',
            $headerEncoded . '.' . $payloadEncoded,
            $this->jwtSecret,
            true
        );
        $signatureEncoded = $this->base64UrlEncode($signature);
        
        // Retornar token completo
        return $headerEncoded . '.' . $payloadEncoded . '.' . $signatureEncoded;
    }
    
    /**
     * PASO 7: Validar token JWT
     */
    public function validateToken($token) {
        try {
            $parts = explode('.', $token);
            
            if (count($parts) !== 3) {
                throw new Exception('Token inválido');
            }
            
            // Verificar firma
            $headerPayload = $parts[0] . '.' . $parts[1];
            $expectedSignature = $this->base64UrlEncode(
                hash_hmac('sha256', $headerPayload, $this->jwtSecret, true)
            );
            
            if (!hash_equals($expectedSignature, $parts[2])) {
                throw new Exception('Firma inválida');
            }
            
            // Decodificar payload
            $payload = json_decode(
                $this->base64UrlDecode($parts[1]),
                true
            );
            
            // Validar expiración
            if ($payload['exp'] < time()) {
                throw new Exception('Token expirado');
            }
            
            return $payload;
            
        } catch (Exception $e) {
            error_log('Error validando token: ' . $e->getMessage());
            return null;
        }
    }
    
    /**
     * PASO 8: Generar URL de stream con token
     */
    public function generateStreamUrl($channelId, $streamPath, $deviceProfile = 'P3', $provider = null) {
        
        // Generar token con proxy auth
        $tokenData = $this->generateTokenWithProxyAuth($channelId, $deviceProfile, $provider);
        
        // Obtener dominio del provider
        $provider = $this->selectProvider(null, $tokenData['provider']);
        
        // Construir URL
        $url = sprintf(
            'http://%s%s?ape_jwt=%s',
            $provider['domain'],
            $streamPath,
            $tokenData['token']
        );
        
        return [
            'url' => $url,
            'token' => $tokenData['token'],
            'provider' => $tokenData['provider_name'],
            'proxy_config' => [
                'host' => $tokenData['proxy_host'],
                'port' => $tokenData['proxy_port'],
                'auth_type' => $tokenData['auth_type']
            ]
        ];
    }
    
    /**
     * PASO 9: Obtener lista de proveedores disponibles
     */
    public function getAvailableProviders() {
        return array_map(function($p) {
            return [
                'id' => $p['id'],
                'name' => $p['name'],
                'domain' => $p['domain'],
                'priority' => $p['priority'],
                'enabled' => $p['enabled'],
                'proxy_auth_type' => $p['proxy_auth_type']
            ];
        }, $this->providers);
    }
    
    /**
     * PASO 10: Cambiar estado de provider
     */
    public function updateProviderStatus($providerId, $enabled) {
        foreach ($this->providers as &$provider) {
            if ($provider['id'] === $providerId) {
                $provider['enabled'] = $enabled;
                return true;
            }
        }
        return false;
    }
    
    /**
     * UTILIDADES
     */
    
    private function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    private function base64UrlDecode($data) {
        $padding = 4 - (strlen($data) % 4);
        if ($padding !== 4) {
            $data .= str_repeat('=', $padding);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
    
    private function generateRandomId() {
        return bin2hex(random_bytes(8));
    }
    
    private function generateProxyKey() {
        return bin2hex(random_bytes(16));
    }
    
    /**
     * LOGGING Y ESTADÍSTICAS
     */
    
    public function logTokenGeneration($channelId, $provider, $success = true) {
        $log = [
            'timestamp' => date('Y-m-d H:i:s'),
            'channel_id' => $channelId,
            'provider' => $provider,
            'success' => $success
        ];
        
        error_log(json_encode($log));
    }
    
    public function getProviderStatistics() {
        $stats = [];
        
        foreach ($this->providers as $provider) {
            $stats[$provider['id']] = [
                'name' => $provider['name'],
                'enabled' => $provider['enabled'],
                'priority' => $provider['priority'],
                'auth_type' => $provider['proxy_auth_type']
            ];
        }
        
        return $stats;
    }
}

/**
 * ENDPOINT API: Generar token
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $_SERVER['PATH_INFO'] === '/api/generate-token') {
    
    header('Content-Type: application/json');
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $server = new ProxyAuthenticationServer();
        
        $result = $server->generateStreamUrl(
            $input['channel_id'] ?? 1,
            $input['stream_path'] ?? '/live/channel.m3u8',
            $input['device_profile'] ?? 'P3',
            $input['provider'] ?? null
        );
        
        http_response_code(200);
        echo json_encode($result);
        
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

/**
 * ENDPOINT API: Obtener proveedores
 */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $_SERVER['PATH_INFO'] === '/api/providers') {
    
    header('Content-Type: application/json');
    
    try {
        $server = new ProxyAuthenticationServer();
        $providers = $server->getAvailableProviders();
        
        http_response_code(200);
        echo json_encode($providers);
        
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

/**
 * ENDPOINT API: Validar token
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $_SERVER['PATH_INFO'] === '/api/validate-token') {
    
    header('Content-Type: application/json');
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $server = new ProxyAuthenticationServer();
        $payload = $server->validateToken($input['token']);
        
        if ($payload) {
            http_response_code(200);
            echo json_encode(['valid' => true, 'payload' => $payload]);
        } else {
            http_response_code(401);
            echo json_encode(['valid' => false, 'error' => 'Token inválido']);
        }
        
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

?>
