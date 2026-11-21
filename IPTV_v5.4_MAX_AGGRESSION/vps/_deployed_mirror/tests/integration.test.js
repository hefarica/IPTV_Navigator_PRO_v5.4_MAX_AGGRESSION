/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔗 PROXY AUTH - PRUEBAS DE INTEGRACIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests de integración para verificar flujos completos
 * Ejecutar en consola del navegador
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const IntegrationTests = {
        passed: 0,
        failed: 0,
        baseUrl: window.location.origin || 'https://iptv-ape.duckdns.org',

        async assert(condition, message) {
            if (condition) {
                this.passed++;
                console.log(`✅ PASS: ${message}`);
                return true;
            } else {
                this.failed++;
                console.error(`❌ FAIL: ${message}`);
                return false;
            }
        },

        async run() {
            console.log('\n═══════════════════════════════════════════════');
            console.log('🔗 INTEGRATION TESTS');
            console.log('═══════════════════════════════════════════════\n');

            await this.testProvidersEndpoint();
            await this.testGenerateTokenEndpoint();
            await this.testValidateTokenEndpoint();
            await this.testUserAgentInFetch();
            await this.testSessionConsistency();

            console.log('\n═══════════════════════════════════════════════');
            console.log(`📊 RESULTS: ${this.passed} passed, ${this.failed} failed`);
            console.log(`📈 SUCCESS RATE: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
            console.log('═══════════════════════════════════════════════\n');

            return {
                passed: this.passed,
                failed: this.failed,
                successRate: ((this.passed / (this.passed + this.failed)) * 100).toFixed(1)
            };
        },

        // TEST 1: Providers Endpoint
        async testProvidersEndpoint() {
            console.log('\n📋 TEST 1: Providers Endpoint');

            try {
                const response = await fetch(`${this.baseUrl}/api/proxy-auth/providers.php`, {
                    cache: 'no-store'
                });

                await this.assert(response.ok, 'Endpoint returns 200');

                const data = await response.json();
                await this.assert(data.success === true, 'Response has success: true');
                await this.assert(Array.isArray(data.providers), 'Providers is array');
                await this.assert(data.count >= 0, 'Count is valid');

            } catch (error) {
                await this.assert(false, `Providers endpoint accessible: ${error.message}`);
            }
        },

        // TEST 2: Generate Token Endpoint
        async testGenerateTokenEndpoint() {
            console.log('\n📋 TEST 2: Generate Token Endpoint');

            try {
                const response = await fetch(`${this.baseUrl}/api/proxy-auth/generate-token.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        channel_id: 1,
                        device_profile: 'P3'
                    }),
                    cache: 'no-store'
                });

                await this.assert(response.ok, 'Endpoint returns 200');

                const data = await response.json();
                await this.assert(data.success === true, 'Response has success: true');
                await this.assert(data.data !== undefined, 'Has data field');

            } catch (error) {
                await this.assert(false, `Generate token endpoint accessible: ${error.message}`);
            }
        },

        // TEST 3: Validate Token Endpoint
        async testValidateTokenEndpoint() {
            console.log('\n📋 TEST 3: Validate Token Endpoint');

            try {
                // Primero generar un token
                const genResponse = await fetch(`${this.baseUrl}/api/proxy-auth/generate-token.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel_id: 1 }),
                    cache: 'no-store'
                });

                const genData = await genResponse.json();
                const token = genData.data?.token || 'test.token.here';

                // Validar token
                const response = await fetch(`${this.baseUrl}/api/proxy-auth/validate-token.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                    cache: 'no-store'
                });

                await this.assert(response.ok, 'Endpoint returns 200');

                const data = await response.json();
                await this.assert(data.success === true, 'Response has success: true');
                await this.assert(typeof data.valid === 'boolean', 'Has valid boolean field');

            } catch (error) {
                await this.assert(false, `Validate token endpoint accessible: ${error.message}`);
            }
        },

        // TEST 4: User Agent in Fetch
        async testUserAgentInFetch() {
            console.log('\n📋 TEST 4: User Agent in Fetch');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const ua = window.userAgentRotation.selectRandomUserAgent();
            await this.assert(typeof ua === 'string', 'Got User Agent string');
            await this.assert(ua.length > 10, 'User Agent has valid length');

            // Note: Can't actually verify header was sent due to CORS restrictions
            console.log(`   User Agent selected: ${ua.substring(0, 50)}...`);
        },

        // TEST 5: Session Consistency
        async testSessionConsistency() {
            console.log('\n📋 TEST 5: Session Consistency');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const sessionId = 'integration_test_' + Date.now();
            const ua1 = window.userAgentRotation.getSessionUserAgent(sessionId);
            const ua2 = window.userAgentRotation.getSessionUserAgent(sessionId);

            await this.assert(ua1 === ua2, 'Same session returns same UA');

            // Clean up
            if (window.userAgentRotation.clearSession) {
                window.userAgentRotation.clearSession(sessionId);
            }
        }
    };

    // Export
    window.IntegrationTests = IntegrationTests;

    console.log('%c🔗 Integration Tests Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   Run: window.IntegrationTests.run()');

})();
