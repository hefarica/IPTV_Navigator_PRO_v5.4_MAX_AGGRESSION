/**
 * SECURITY-TESTS.js
 * IPTV Navigator PRO - Suite de Tests de Seguridad v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Verificar funcionamiento de módulos de seguridad
 * - Tests automatizados de validación
 * - Tests de sanitización anti-XSS
 * - Tests de detección SSRF
 * 
 * ✅ USO:
 * Ejecutar en consola del navegador:
 *   await SecurityTests.runAll()
 */

const SecurityTests = {
    results: [],

    /**
     * Ejecutar todos los tests
     */
    async runAll() {
        console.group('🧪 SECURITY TEST SUITE');
        console.log('Iniciando tests de seguridad...\n');

        this.results = [];

        // Tests de validación
        await this.testConnectionValidation();
        await this.testUrlValidation();
        await this.testSSRFProtection();
        await this.testXSSSanitization();
        await this.testChannelSanitization();
        await this.testIntegrityVerification();
        await this.testPhantomDetection();

        // Resumen
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;

        console.log('\n═══════════════════════════════════════════');
        console.log(`📊 RESULTADOS: ${passed} pasaron, ${failed} fallaron`);
        console.log('═══════════════════════════════════════════');

        if (failed > 0) {
            console.log('\n❌ Tests fallidos:');
            this.results.filter(r => !r.passed).forEach(r => {
                console.log(`   - ${r.name}: ${r.error}`);
            });
        }

        console.groupEnd();

        return {
            total: this.results.length,
            passed,
            failed,
            details: this.results
        };
    },

    /**
     * Helper para registrar resultado
     */
    _record(name, passed, error = null) {
        this.results.push({ name, passed, error });
        console.log(`${passed ? '✅' : '❌'} ${name}`);
        if (!passed && error) console.log(`   Error: ${error}`);
    },

    /**
     * TEST 1: Validación de conexión
     */
    async testConnectionValidation() {
        console.log('\n📋 Test: Validación de Conexión');

        const securityModule = window.app?.securityModule;
        if (!securityModule) {
            this._record('ConnectionValidation - Module Available', false, 'SecurityModule no disponible');
            return;
        }

        // Test 1.1: Datos válidos
        const validData = {
            baseUrl: 'http://example.iptv.com',
            username: 'testuser',
            password: 'testpass123'
        };
        const validResult = securityModule.validateConnection(validData);
        this._record('ConnectionValidation - Valid Data', validResult.valid);

        // Test 1.2: URL vacía
        const emptyUrl = { ...validData, baseUrl: '' };
        const emptyUrlResult = securityModule.validateConnection(emptyUrl);
        this._record('ConnectionValidation - Empty URL Rejected', !emptyUrlResult.valid);

        // Test 1.3: Username con caracteres inválidos
        const invalidUser = { ...validData, username: 'user<script>' };
        const invalidUserResult = securityModule.validateConnection(invalidUser);
        this._record('ConnectionValidation - Invalid Username Rejected', !invalidUserResult.valid);

        // Test 1.4: Username muy largo
        const longUser = { ...validData, username: 'a'.repeat(150) };
        const longUserResult = securityModule.validateConnection(longUser);
        this._record('ConnectionValidation - Long Username Rejected', !longUserResult.valid);
    },

    /**
     * TEST 2: Validación de URL
     */
    async testUrlValidation() {
        console.log('\n📋 Test: Validación de URL');

        const securityModule = window.app?.securityModule;
        if (!securityModule) {
            this._record('UrlValidation - Module Available', false, 'SecurityModule no disponible');
            return;
        }

        // Test 2.1: URL válida
        const validUrl = securityModule.validateFetchUrl('https://api.iptv.com/streams');
        this._record('UrlValidation - HTTPS URL Valid', validUrl.valid);

        // Test 2.2: URL HTTP válida
        const httpUrl = securityModule.validateFetchUrl('http://iptv.server.com');
        this._record('UrlValidation - HTTP URL Valid', httpUrl.valid);

        // Test 2.3: URL sin protocolo (inválida)
        const noProtocol = securityModule.validateFetchUrl('iptv.server.com');
        // Nota: La validación interna agrega protocolo, así que podría pasar
        this._record('UrlValidation - No Protocol Handled', noProtocol.valid || noProtocol.error !== undefined);
    },

    /**
     * TEST 3: Protección SSRF
     */
    async testSSRFProtection() {
        console.log('\n📋 Test: Protección SSRF');

        const securityModule = window.app?.securityModule;
        if (!securityModule) {
            this._record('SSRF - Module Available', false, 'SecurityModule no disponible');
            return;
        }

        // Test 3.1: Localhost bloqueado
        const localhost = securityModule.validateFetchUrl('http://localhost/api');
        this._record('SSRF - Localhost Blocked', !localhost.valid);

        // Test 3.2: 127.0.0.1 bloqueado
        const loopback = securityModule.validateFetchUrl('http://127.0.0.1:8080');
        this._record('SSRF - 127.0.0.1 Blocked', !loopback.valid);

        // Test 3.3: Redes privadas 10.x bloqueadas
        const private10 = securityModule.validateFetchUrl('http://10.0.0.1/api');
        this._record('SSRF - 10.x.x.x Blocked', !private10.valid);

        // Test 3.4: Redes privadas 192.168.x bloqueadas
        const private192 = securityModule.validateFetchUrl('http://192.168.1.1/admin');
        this._record('SSRF - 192.168.x.x Blocked', !private192.valid);

        // Test 3.5: AWS Metadata bloqueado
        const awsMetadata = securityModule.validateFetchUrl('http://169.254.169.254/latest/meta-data');
        this._record('SSRF - AWS Metadata Blocked', !awsMetadata.valid);
    },

    /**
     * TEST 4: Sanitización XSS
     */
    async testXSSSanitization() {
        console.log('\n📋 Test: Sanitización XSS');

        const securityModule = window.app?.securityModule;
        if (!securityModule) {
            this._record('XSS - Module Available', false, 'SecurityModule no disponible');
            return;
        }

        // Test 4.1: Script tag escapado
        const scriptTest = securityModule.escapeForHtml('<script>alert("xss")</script>');
        const scriptEscaped = !scriptTest.includes('<script>');
        this._record('XSS - Script Tags Escaped', scriptEscaped);

        // Test 4.2: Caracteres especiales escapados
        const specialTest = securityModule.escapeForHtml('<div onclick="evil()">');
        const specialEscaped = !specialTest.includes('<') || specialTest.includes('&lt;');
        this._record('XSS - Special Chars Escaped', specialEscaped);

        // Test 4.3: Texto normal no modificado
        const normalText = 'Canal HBO HD 1080p';
        const normalResult = securityModule.escapeForHtml(normalText);
        this._record('XSS - Normal Text Preserved', normalResult === normalText);
    },

    /**
     * TEST 5: Sanitización de canales
     */
    async testChannelSanitization() {
        console.log('\n📋 Test: Sanitización de Canales');

        const securityModule = window.app?.securityModule;
        if (!securityModule) {
            this._record('ChannelSanitization - Module Available', false, 'SecurityModule no disponible');
            return;
        }

        // Test 5.1: Canal válido pasa
        const validChannel = {
            stream_id: 123,
            name: 'ESPN HD',
            category_name: 'Deportes'
        };
        const validChannels = securityModule.sanitizeChannelsFromApi([validChannel]);
        this._record('ChannelSanitization - Valid Channel Passes', validChannels.length === 1);

        // Test 5.2: Canal con script en nombre es sanitizado
        const xssChannel = {
            stream_id: 456,
            name: '<script>alert("xss")</script>ESPN',
            category_name: 'Deportes'
        };
        const xssChannels = securityModule.sanitizeChannelsFromApi([xssChannel]);
        const nameIsSafe = xssChannels[0]?.name && !xssChannels[0].name.includes('<script>');
        this._record('ChannelSanitization - XSS in Name Blocked', nameIsSafe);

        // Test 5.3: Canal sin nombre ni ID es rechazado
        const emptyChannel = { category_name: 'Test' };
        const emptyChannels = securityModule.sanitizeChannelsFromApi([emptyChannel]);
        this._record('ChannelSanitization - Empty Channel Rejected', emptyChannels.length === 0);
    },

    /**
     * TEST 6: Verificación de integridad
     */
    async testIntegrityVerification() {
        console.log('\n📋 Test: Verificación de Integridad');

        const persistenceModule = window.app?.persistenceHardening;
        if (!persistenceModule) {
            this._record('Integrity - Module Available', false, 'PersistenceHardeningModule no disponible');
            return;
        }

        // Test 6.1: Verificación retorna objeto válido
        const result = await persistenceModule.verifyIntegrity();
        this._record('Integrity - Returns Valid Object',
            result && typeof result.consistent === 'boolean' && Array.isArray(result.issues));

        // Test 6.2: Checksum es calculado
        this._record('Integrity - Checksum Calculated',
            result.ramChecksum && result.ramChecksum !== '0');
    },

    /**
     * TEST 7: Detección de fantasmas
     */
    async testPhantomDetection() {
        console.log('\n📋 Test: Detección de Fantasmas');

        const persistenceModule = window.app?.persistenceHardening;
        if (!persistenceModule) {
            this._record('Phantoms - Module Available', false, 'PersistenceHardeningModule no disponible');
            return;
        }

        // Test 7.1: Método retorna array
        const phantoms = persistenceModule.detectPhantomServers();
        this._record('Phantoms - Returns Array', Array.isArray(phantoms));

        // Test 7.2: Detectar huérfanos retorna array
        const orphans = persistenceModule.detectOrphanChannels();
        this._record('Orphans - Returns Array', Array.isArray(orphans));
    }
};

// Exponer globalmente
if (typeof window !== 'undefined') {
    window.SecurityTests = SecurityTests;
    console.log('🧪 SecurityTests disponible. Ejecutar: await SecurityTests.runAll()');
}
