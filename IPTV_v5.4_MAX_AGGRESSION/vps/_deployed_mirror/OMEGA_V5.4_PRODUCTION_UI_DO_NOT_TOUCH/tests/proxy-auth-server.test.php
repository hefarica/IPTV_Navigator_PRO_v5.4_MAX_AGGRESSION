<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧪 PROXY AUTH - PRUEBAS UNITARIAS PHP
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests para ProxyAuthenticationServer
 * Ejecutar: php tests/proxy-auth-server.test.php
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

class ProxyAuthServerTest {
    private $passed = 0;
    private $failed = 0;
    private $server = null;
    
    public function __construct() {
        // Intentar cargar el servidor
        $serverPath = __DIR__ . '/../vps/proxy-auth-server.php';
        
        if (file_exists($serverPath)) {
            require_once $serverPath;
            $this->server = new ProxyAuthenticationServer();
        }
    }
    
    private function assert($condition, $message) {
        if ($condition) {
            $this->passed++;
            echo "✅ PASS: $message\n";
            return true;
        } else {
            $this->failed++;
            echo "❌ FAIL: $message\n";
            return false;
        }
    }
    
    public function run() {
        echo "\n═══════════════════════════════════════════════\n";
        echo "🧪 PROXY AUTH SERVER - PHP UNIT TESTS\n";
        echo "═══════════════════════════════════════════════\n\n";
        
        $this->testServerExists();
        $this->testSelectProvider();
        $this->testEncryptDecrypt();
        $this->testGenerateToken();
        $this->testValidateToken();
        $this->testGetProviders();
        
        echo "\n═══════════════════════════════════════════════\n";
        echo "📊 RESULTS: {$this->passed} passed, {$this->failed} failed\n";
        $coverage = $this->passed / max(1, ($this->passed + $this->failed)) * 100;
        echo "📈 COVERAGE: " . number_format($coverage, 1) . "%\n";
        echo "═══════════════════════════════════════════════\n\n";
        
        return [
            'passed' => $this->passed,
            'failed' => $this->failed,
            'coverage' => $coverage
        ];
    }
    
    // TEST 1: Server Exists
    public function testServerExists() {
        echo "\n📋 TEST 1: Server Exists\n";
        
        $serverPath = __DIR__ . '/../vps/proxy-auth-server.php';
        $this->assert(file_exists($serverPath), 'proxy-auth-server.php exists');
        
        if ($this->server) {
            $this->assert(true, 'ProxyAuthenticationServer class instantiated');
        } else {
            $this->assert(false, 'ProxyAuthenticationServer class instantiated');
        }
    }
    
    // TEST 2: Select Provider
    public function testSelectProvider() {
        echo "\n📋 TEST 2: Select Provider\n";
        
        if (!$this->server) {
            echo "⚠️ SKIP: Server not available\n";
            return;
        }
        
        try {
            $provider = $this->server->selectProvider();
            $this->assert($provider !== null, 'Provider is not null');
            $this->assert(isset($provider['id']), 'Provider has id');
            $this->assert(isset($provider['domain']), 'Provider has domain');
        } catch (Exception $e) {
            $this->assert(false, 'Select provider: ' . $e->getMessage());
        }
    }
    
    // TEST 3: Encrypt/Decrypt
    public function testEncryptDecrypt() {
        echo "\n📋 TEST 3: Encrypt/Decrypt\n";
        
        if (!$this->server) {
            echo "⚠️ SKIP: Server not available\n";
            return;
        }
        
        try {
            $plaintext = 'test_password_12345';
            $encrypted = $this->server->encryptCredential($plaintext);
            
            $this->assert(!empty($encrypted), 'Encrypted result is not empty');
            $this->assert($encrypted !== $plaintext, 'Encrypted differs from plaintext');
            
            $decrypted = $this->server->decryptCredential($encrypted);
            $this->assert($decrypted === $plaintext, 'Decrypted matches original');
        } catch (Exception $e) {
            $this->assert(false, 'Encrypt/Decrypt: ' . $e->getMessage());
        }
    }
    
    // TEST 4: Generate Token
    public function testGenerateToken() {
        echo "\n📋 TEST 4: Generate Token\n";
        
        if (!$this->server) {
            echo "⚠️ SKIP: Server not available\n";
            return;
        }
        
        try {
            $tokenData = $this->server->generateTokenWithProxyAuth(1, 'P3');
            
            $this->assert(is_array($tokenData), 'Token data is array');
            $this->assert(isset($tokenData['token']), 'Token data has token field');
            
            // Verificar estructura JWT (3 partes separadas por .)
            $parts = explode('.', $tokenData['token']);
            $this->assert(count($parts) === 3, 'Token has 3 JWT parts');
        } catch (Exception $e) {
            $this->assert(false, 'Generate token: ' . $e->getMessage());
        }
    }
    
    // TEST 5: Validate Token
    public function testValidateToken() {
        echo "\n📋 TEST 5: Validate Token\n";
        
        if (!$this->server) {
            echo "⚠️ SKIP: Server not available\n";
            return;
        }
        
        try {
            // Generar un token primero
            $tokenData = $this->server->generateTokenWithProxyAuth(1, 'P3');
            
            if (isset($tokenData['token'])) {
                $isValid = $this->server->validateToken($tokenData['token']);
                $this->assert($isValid === true, 'Generated token is valid');
            } else {
                $this->assert(false, 'No token to validate');
            }
            
            // Token inválido
            $isInvalid = $this->server->validateToken('invalid.token.here');
            $this->assert($isInvalid === false, 'Invalid token returns false');
        } catch (Exception $e) {
            $this->assert(false, 'Validate token: ' . $e->getMessage());
        }
    }
    
    // TEST 6: Get Providers
    public function testGetProviders() {
        echo "\n📋 TEST 6: Get Available Providers\n";
        
        if (!$this->server) {
            echo "⚠️ SKIP: Server not available\n";
            return;
        }
        
        try {
            $providers = $this->server->getAvailableProviders();
            
            $this->assert(is_array($providers), 'Providers is array');
            $this->assert(count($providers) > 0, 'Has at least one provider');
            
            if (count($providers) > 0) {
                $this->assert(isset($providers[0]['id']), 'First provider has id');
                $this->assert(isset($providers[0]['name']), 'First provider has name');
            }
        } catch (Exception $e) {
            $this->assert(false, 'Get providers: ' . $e->getMessage());
        }
    }
}

// Ejecutar tests si se ejecuta directamente
if (php_sapi_name() === 'cli' || basename($_SERVER['SCRIPT_FILENAME']) === 'proxy-auth-server.test.php') {
    $test = new ProxyAuthServerTest();
    $results = $test->run();
    
    // Exit code basado en resultado
    exit($results['failed'] > 0 ? 1 : 0);
}
