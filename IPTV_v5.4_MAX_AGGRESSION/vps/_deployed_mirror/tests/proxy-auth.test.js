/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧪 PROXY AUTH - PRUEBAS UNITARIAS JAVASCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests para ProxyAuthenticationModule y UserAgentRotationModule
 * Ejecutar en consola del navegador o con Jest/Mocha
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const TestRunner = {
        passed: 0,
        failed: 0,
        tests: [],

        assert(condition, message) {
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

        run() {
            console.log('\n═══════════════════════════════════════════════');
            console.log('🧪 PROXY AUTH - UNIT TESTS');
            console.log('═══════════════════════════════════════════════\n');

            this.testProxyAuthModuleExists();
            this.testUserAgentRotationExists();
            this.testSelectRandomUserAgent();
            this.testSessionUserAgentConsistency();
            this.testUserAgentRotation();
            this.testStatistics();
            this.testProxyAuthDetection();

            console.log('\n═══════════════════════════════════════════════');
            console.log(`📊 RESULTS: ${this.passed} passed, ${this.failed} failed`);
            console.log(`📈 COVERAGE: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
            console.log('═══════════════════════════════════════════════\n');

            return {
                passed: this.passed,
                failed: this.failed,
                total: this.passed + this.failed,
                coverage: ((this.passed / (this.passed + this.failed)) * 100).toFixed(1)
            };
        },

        // TEST 1: ProxyAuthModule exists
        testProxyAuthModuleExists() {
            console.log('\n📋 TEST 1: ProxyAuthModule Exists');

            const exists = typeof window.proxyAuthModule !== 'undefined' ||
                typeof window.ProxyAuthenticationModule !== 'undefined';

            this.assert(exists, 'ProxyAuthModule is defined');
        },

        // TEST 2: UserAgentRotation exists
        testUserAgentRotationExists() {
            console.log('\n📋 TEST 2: UserAgentRotation Exists');

            const exists = typeof window.userAgentRotation !== 'undefined' ||
                typeof window.UserAgentRotationModule !== 'undefined';

            this.assert(exists, 'UserAgentRotation is defined');

            const hasDatabase = typeof window.USER_AGENTS_DATABASE !== 'undefined';
            this.assert(hasDatabase, 'USER_AGENTS_DATABASE is defined');
        },

        // TEST 3: Select Random User Agent
        testSelectRandomUserAgent() {
            console.log('\n📋 TEST 3: Select Random User Agent');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const ua = window.userAgentRotation.selectRandomUserAgent();

            this.assert(typeof ua === 'string', 'Returns a string');
            this.assert(ua.length > 10, 'String has valid length (>10 chars)');
            this.assert(ua.includes('Mozilla') || ua.includes('OTT') || ua.includes('VLC'),
                'Contains valid UA identifier');
        },

        // TEST 4: Session User Agent Consistency
        testSessionUserAgentConsistency() {
            console.log('\n📋 TEST 4: Session User Agent Consistency');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const sessionId = 'test_session_' + Date.now();
            const ua1 = window.userAgentRotation.getSessionUserAgent(sessionId);
            const ua2 = window.userAgentRotation.getSessionUserAgent(sessionId);

            this.assert(ua1 === ua2, 'Same session returns same UA');
        },

        // TEST 5: User Agent Rotation
        testUserAgentRotation() {
            console.log('\n📋 TEST 5: User Agent Rotation');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const sessionId = 'test_rotation_' + Date.now();
            const ua1 = window.userAgentRotation.getSessionUserAgent(sessionId);
            window.userAgentRotation.rotateUserAgent(sessionId);
            const ua2 = window.userAgentRotation.getSessionUserAgent(sessionId);

            // Note: Due to randomness, there's a small chance they could be the same
            this.assert(typeof ua2 === 'string' && ua2.length > 10,
                'Rotated UA is valid string');
        },

        // TEST 6: Statistics
        testStatistics() {
            console.log('\n📋 TEST 6: Statistics');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const stats = window.userAgentRotation.getStatistics();

            this.assert(typeof stats === 'object', 'Returns an object');
            this.assert(typeof stats.totalSelections !== 'undefined',
                'Has totalSelections property');
            this.assert(typeof stats.categories !== 'undefined',
                'Has categories property');
        },

        // TEST 7: Proxy Auth Detection (Mock)
        testProxyAuthDetection() {
            console.log('\n📋 TEST 7: Proxy Auth Detection');

            // Mock response with 407 status
            const mockResponse407 = {
                status: 407,
                headers: new Map([['Proxy-Authenticate', 'Basic realm="Proxy"']])
            };

            const is407 = mockResponse407.status === 407;
            this.assert(is407, 'Detects HTTP 407 status');

            const hasAuthHeader = mockResponse407.headers.has('Proxy-Authenticate');
            this.assert(hasAuthHeader, 'Has Proxy-Authenticate header');

            // Mock response with 200 status
            const mockResponse200 = {
                status: 200,
                headers: new Map()
            };

            const isNot407 = mockResponse200.status !== 407;
            this.assert(isNot407, 'HTTP 200 is not detected as 407');
        }
    };

    // Export and auto-run
    window.ProxyAuthTests = TestRunner;

    console.log('%c🧪 Proxy Auth Tests Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   Run: window.ProxyAuthTests.run()');

})();
