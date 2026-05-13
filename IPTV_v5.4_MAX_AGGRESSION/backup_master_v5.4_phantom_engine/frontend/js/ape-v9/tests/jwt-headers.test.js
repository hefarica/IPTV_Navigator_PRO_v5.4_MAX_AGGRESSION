/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JWT HEADERS TEST SUITE v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests para validar:
 * - Construcción de JWT con 68+ campos
 * - Codificación Base64URL correcta
 * - Validación de campos requeridos
 * - Estructura de 8 secciones
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const TestSuite = {
        passed: 0,
        failed: 0,
        results: [],

        // ═══════════════════════════════════════════════════════════════════
        // UTILIDADES DE TEST
        // ═══════════════════════════════════════════════════════════════════

        assert(condition, testName, details = '') {
            if (condition) {
                this.passed++;
                this.results.push({ name: testName, status: '✅ PASS', details });
                console.log(`✅ PASS: ${testName}`);
            } else {
                this.failed++;
                this.results.push({ name: testName, status: '❌ FAIL', details });
                console.error(`❌ FAIL: ${testName}`, details);
            }
            return condition;
        },

        assertEqual(actual, expected, testName) {
            const pass = actual === expected;
            return this.assert(pass, testName, pass ? '' : `Expected: ${expected}, Got: ${actual}`);
        },

        assertGreaterOrEqual(actual, expected, testName) {
            const pass = actual >= expected;
            return this.assert(pass, testName, pass ? `${actual} >= ${expected}` : `Expected >= ${expected}, Got: ${actual}`);
        },

        // ═══════════════════════════════════════════════════════════════════
        // MOCK DE CANAL
        // ═══════════════════════════════════════════════════════════════════

        getMockChannel(index = 0) {
            return {
                stream_id: 1000 + index,
                id: 1000 + index,
                name: `Canal Test ${index}`,
                category_name: 'Test Category',
                group: 'Test Group',
                stream_icon: 'https://example.com/logo.png',
                logo: 'https://example.com/logo.png',
                url: 'http://example.com/stream.m3u8',
                catchup: 'xc',
                catchup_days: 7,
                resolution: '1920x1080',
                bitrate: 8.5
            };
        },

        // ═══════════════════════════════════════════════════════════════════
        // TESTS DE JWT
        // ═══════════════════════════════════════════════════════════════════

        testJWTStructure() {
            console.group('🧪 Test: JWT Structure');

            // Verificar que M3U8GeneratorArch1 existe
            if (!window.M3U8GeneratorArch1) {
                this.assert(false, 'M3U8GeneratorArch1 available', 'Module not loaded');
                console.groupEnd();
                return;
            }

            // Generar M3U8 con un canal de prueba
            const channels = [this.getMockChannel(0)];
            const m3u8 = window.M3U8GeneratorArch1.generate(channels);

            // Extraer JWT de la URL
            const jwtMatch = m3u8.match(/ape_jwt=([^&\s]+)/);
            this.assert(!!jwtMatch, 'JWT present in M3U8 output');

            if (jwtMatch) {
                const jwt = jwtMatch[1];
                const parts = jwt.split('.');
                this.assertEqual(parts.length, 3, 'JWT has 3 parts (header.payload.signature)');

                // Validar Base64URL
                const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
                this.assert(base64UrlRegex.test(parts[0]), 'JWT header is valid Base64URL');
                this.assert(base64UrlRegex.test(parts[1]), 'JWT payload is valid Base64URL');
                this.assert(base64UrlRegex.test(parts[2]), 'JWT signature is valid Base64URL');

                // Verificar que no contiene caracteres inválidos
                this.assert(!jwt.includes('+'), 'JWT does not contain + (invalid for URL)');
                this.assert(!jwt.includes('/'), 'JWT does not contain / (invalid for URL)');
                this.assert(!jwt.includes('='), 'JWT does not contain = (padding removed)');
            }

            console.groupEnd();
        },

        testJWTFieldCount() {
            console.group('🧪 Test: JWT Field Count (68+)');

            if (!window.M3U8GeneratorArch1 || !window.JWTValidator) {
                this.assert(false, 'Required modules available', 'M3U8GeneratorArch1 or JWTValidator not loaded');
                console.groupEnd();
                return;
            }

            const channels = [this.getMockChannel(0)];
            const m3u8 = window.M3U8GeneratorArch1.generate(channels);
            const jwtMatch = m3u8.match(/ape_jwt=([^&\s]+)/);

            if (jwtMatch) {
                const jwt = jwtMatch[1];
                const fieldCount = window.JWTValidator.countFields(jwt);

                this.assertGreaterOrEqual(fieldCount.topLevel, 68, `JWT has 68+ top-level fields (got ${fieldCount.topLevel})`);

                // Validar estructura
                const validation = window.JWTValidator.validateJWT(jwt);
                this.assert(validation.valid, 'JWT passes validation');
                this.assertEqual(validation.errors.length, 0, 'JWT has no validation errors');

                // Verificar secciones
                console.log('📊 Sections:', validation.sections);
                this.assertGreaterOrEqual(validation.sections.identification, 6, 'Identification section has 6+ fields');
                this.assertGreaterOrEqual(validation.sections.channel_info, 6, 'Channel info section has 6+ fields');
                this.assertGreaterOrEqual(validation.sections.profile_config, 8, 'Profile config section has 8+ fields');
            }

            console.groupEnd();
        },

        testJWTRequiredFields() {
            console.group('🧪 Test: JWT Required Fields');

            if (!window.M3U8GeneratorArch1 || !window.JWTValidator) {
                this.assert(false, 'Required modules available');
                console.groupEnd();
                return;
            }

            const channels = [this.getMockChannel(0)];
            const m3u8 = window.M3U8GeneratorArch1.generate(channels);
            const jwtMatch = m3u8.match(/ape_jwt=([^&\s]+)/);

            if (jwtMatch) {
                const jwt = jwtMatch[1];
                const decoded = window.JWTValidator.decodeJWT(jwt);

                if (decoded.valid) {
                    const payload = decoded.payload;

                    // Verificar campos JWT estándar
                    this.assert('iss' in payload, 'Has iss (issuer)');
                    this.assert('iat' in payload, 'Has iat (issued at)');
                    this.assert('exp' in payload, 'Has exp (expiration)');
                    this.assert('jti' in payload, 'Has jti (JWT ID)');
                    this.assert('sub' in payload, 'Has sub (subject)');
                    this.assert('nonce' in payload, 'Has nonce (anti-replay)');

                    // Verificar campos de canal
                    this.assert('chn' in payload, 'Has chn (channel name)');
                    this.assert('device_profile' in payload, 'Has device_profile');
                    this.assert('resolution' in payload, 'Has resolution');

                    // Verificar campos de seguridad
                    this.assert('dfp' in payload, 'Has dfp (device fingerprint)');
                    this.assert('service_tier' in payload, 'Has service_tier');

                    // Verificar campos de prefetch
                    this.assert('prefetch_segments' in payload, 'Has prefetch_segments');
                    this.assert('prefetch_parallel' in payload, 'Has prefetch_parallel');

                    // Verificar expiración (365 días)
                    const now = Math.floor(Date.now() / 1000);
                    const expDays = (payload.exp - now) / (24 * 60 * 60);
                    this.assertGreaterOrEqual(expDays, 364, `Expiration is ~365 days (got ${expDays.toFixed(1)})`);
                }
            }

            console.groupEnd();
        },

        testGlobalHeader() {
            console.group('🧪 Test: Global Header');

            if (!window.M3U8GeneratorArch1) {
                this.assert(false, 'M3U8GeneratorArch1 available');
                console.groupEnd();
                return;
            }

            const channels = [this.getMockChannel(0), this.getMockChannel(1)];
            const m3u8 = window.M3U8GeneratorArch1.generate(channels);
            const lines = m3u8.split('\n');

            // Verificar cabecera
            this.assert(lines[0] === '#EXTM3U', 'Starts with #EXTM3U');
            this.assert(m3u8.includes('#EXT-X-VERSION:'), 'Has HLS version');
            this.assert(m3u8.includes('#EXT-X-APE-'), 'Has APE custom headers');
            this.assert(m3u8.includes('#EXT-X-APE-PROFILE-BEGIN'), 'Has profile definitions');

            // Contar líneas de cabecera (antes del primer #EXTINF)
            const firstExtinfIndex = lines.findIndex(l => l.startsWith('#EXTINF'));
            if (firstExtinfIndex > 0) {
                console.log(`📊 Header lines: ${firstExtinfIndex}`);
                this.assertGreaterOrEqual(firstExtinfIndex, 50, `Header has 50+ lines (got ${firstExtinfIndex})`);
            }

            console.groupEnd();
        },

        testChannelEntry() {
            console.group('🧪 Test: Channel Entry');

            if (!window.M3U8GeneratorArch1) {
                this.assert(false, 'M3U8GeneratorArch1 available');
                console.groupEnd();
                return;
            }

            const channels = [this.getMockChannel(0)];
            const m3u8 = window.M3U8GeneratorArch1.generate(channels);

            // Verificar estructura de canal
            this.assert(m3u8.includes('#EXTINF:-1'), 'Has EXTINF with duration');
            this.assert(m3u8.includes('tvg-id='), 'Has tvg-id attribute');
            this.assert(m3u8.includes('tvg-name='), 'Has tvg-name attribute');
            this.assert(m3u8.includes('tvg-logo='), 'Has tvg-logo attribute');
            this.assert(m3u8.includes('group-title='), 'Has group-title attribute');
            this.assert(m3u8.includes('ape-profile='), 'Has ape-profile attribute');
            this.assert(m3u8.includes('catchup='), 'Has catchup attribute');
            this.assert(m3u8.includes('ape_jwt='), 'Has JWT in URL');

            console.groupEnd();
        },

        // ═══════════════════════════════════════════════════════════════════
        // EJECUTAR TODOS LOS TESTS
        // ═══════════════════════════════════════════════════════════════════

        runAll() {
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff41; font-weight: bold;');
            console.log('%c JWT HEADERS TEST SUITE v1.0', 'color: #00ff41; font-weight: bold; font-size: 14px;');
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff41; font-weight: bold;');

            this.passed = 0;
            this.failed = 0;
            this.results = [];

            // Ejecutar tests
            this.testJWTStructure();
            this.testJWTFieldCount();
            this.testJWTRequiredFields();
            this.testGlobalHeader();
            this.testChannelEntry();

            // Resumen
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #03a9f4; font-weight: bold;');
            console.log(`%c📊 RESULTADOS: ${this.passed} passed, ${this.failed} failed`,
                this.failed === 0 ? 'color: #4ade80; font-weight: bold;' : 'color: #ff6b6b; font-weight: bold;');
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #03a9f4; font-weight: bold;');

            return {
                passed: this.passed,
                failed: this.failed,
                total: this.passed + this.failed,
                results: this.results,
                success: this.failed === 0
            };
        }
    };

    // Exponer globalmente
    if (typeof window !== 'undefined') {
        window.JWTHeadersTestSuite = TestSuite;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TestSuite;
    }

    console.log('🧪 JWT Headers Test Suite Loaded');
    console.log('   ▸ Run tests: JWTHeadersTestSuite.runAll()');

})();
