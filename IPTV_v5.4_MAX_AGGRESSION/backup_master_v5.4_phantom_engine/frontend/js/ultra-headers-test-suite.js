/**
 * ═══════════════════════════════════════════════════════════════════
 * 🧪 ULTRA HEADERS TEST SUITE v1.0
 * ═══════════════════════════════════════════════════════════════════
 */

class UltraTestSuite {
    constructor() {
        this.results = [];
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🏃 EJECUTAR TODOS LOS TESTS
     * ═══════════════════════════════════════════════════════════════
     */
    async runAllTests() {
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('[TEST-SUITE] 🧪 Iniciando batería de tests...');
        console.log('═══════════════════════════════════════════════════════════════\n');

        this.results = [];

        // Test 1: Validación de estructura de headers
        await this.testHeadersStructure();

        // Test 2: Validación de valores por nivel
        await this.testLevelValues();

        // Test 3: Generación de M3U8
        await this.testM3U8Generation();

        // Test 4: Performance headers
        await this.testHeadersPerformance();

        // Reporte final
        this.generateReport();

        return this.results;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ✅ TEST 1: ESTRUCTURA DE HEADERS
     * ═══════════════════════════════════════════════════════════════
     */
    async testHeadersStructure() {
        console.log('[TEST-SUITE] Test 1: Validando estructura de headers...');

        const test = {
            name: 'Headers Structure Validation',
            passed: 0,
            failed: 0,
            warnings: [],
            details: []
        };

        const matrix = window.ULTRA_HEADERS_MATRIX;

        if (!matrix) {
            test.failed++;
            test.warnings.push('ULTRA_HEADERS_MATRIX no está disponible');
            this.results.push(test);
            return;
        }

        // Verificar cada header
        Object.keys(matrix.headers).forEach(headerName => {
            const header = matrix.headers[headerName];

            // Validar campos obligatorios
            if (!header.description) {
                test.failed++;
                test.warnings.push(`${headerName}: Missing description`);
            } else {
                test.passed++;
            }

            if (!header.category) {
                test.failed++;
                test.warnings.push(`${headerName}: Missing category`);
            } else {
                test.passed++;
            }

            if (!header.levels || Object.keys(header.levels).length !== 5) {
                test.failed++;
                test.warnings.push(`${headerName}: Invalid levels (need 5, got ${Object.keys(header.levels || {}).length})`);
            } else {
                test.passed++;

                // Validar cada nivel
                [1, 2, 3, 4, 5].forEach(level => {
                    const levelConfig = header.levels[level];
                    if (!levelConfig || (levelConfig.value === undefined && !levelConfig.generator)) {
                        test.failed++;
                        test.warnings.push(`${headerName} Level ${level}: Missing value/generator`);
                    } else {
                        test.passed++;
                    }
                });
            }
        });

        test.details.push(`Total headers: ${Object.keys(matrix.headers).length}`);
        test.details.push(`Validations passed: ${test.passed}`);
        test.details.push(`Validations failed: ${test.failed}`);

        this.results.push(test);
        console.log(`✅ Test 1 completado: ${test.passed} passed, ${test.failed} failed\n`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ✅ TEST 2: VALORES POR NIVEL
     * ═══════════════════════════════════════════════════════════════
     */
    async testLevelValues() {
        console.log('[TEST-SUITE] Test 2: Validando progresión de valores...');

        const test = {
            name: 'Level Values Progression',
            passed: 0,
            failed: 0,
            warnings: [],
            details: []
        };

        const matrix = window.ULTRA_HEADERS_MATRIX;
        if (!matrix) {
            test.failed++;
            this.results.push(test);
            return;
        }

        // Verificar headers numéricos aumentan en agresividad
        const numericHeaders = ['X-Buffer-Size', 'X-Preload-Duration'];

        numericHeaders.forEach(headerName => {
            const header = matrix.headers[headerName];
            if (!header) return;

            let previousValue = 0;
            let progression = true;

            [1, 2, 3, 4, 5].forEach(level => {
                const levelConfig = header.levels[level];
                if (!levelConfig) return;

                let value = levelConfig.value;

                const match = String(value).match(/(\d+)/);
                if (match) {
                    const numValue = parseInt(match[1]);

                    if (numValue <= previousValue && level > 1) {
                        progression = false;
                        test.failed++;
                        test.warnings.push(`${headerName} Level ${level}: Value (${numValue}) should be > Level ${level - 1} (${previousValue})`);
                    } else {
                        test.passed++;
                    }

                    previousValue = numValue;
                }
            });

            test.details.push(`${headerName}: Progression ${progression ? '✅ OK' : '❌ FAIL'}`);
        });

        this.results.push(test);
        console.log(`✅ Test 2 completado: ${test.passed} passed, ${test.failed} failed\n`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ✅ TEST 3: GENERACIÓN M3U8
     * ═══════════════════════════════════════════════════════════════
     */
    async testM3U8Generation() {
        console.log('[TEST-SUITE] Test 3: Validando generación M3U8...');

        const test = {
            name: 'M3U8 Generation',
            passed: 0,
            failed: 0,
            warnings: [],
            details: []
        };

        const generator = window.m3u8UltraGenerator;
        if (!generator) {
            test.failed++;
            test.warnings.push('m3u8UltraGenerator no está disponible');
            this.results.push(test);
            return;
        }

        // Canal de prueba
        const testChannel = {
            stream_id: "test_001",
            name: "Test Channel 4K",
            category_name: "Test",
            stream_icon: "https://example.com/icon.png",
            stream_type: "live",
            heuristics: {
                qualityTier: "4K",
                bitrate: 25000,
                codec: "hevc"
            },
            resolution: "3840x2160"
        };

        const testServer = {
            type: "xui",
            baseUrl: "http://test-server.com:8080",
            username: "testuser",
            password: "testpass"
        };

        // Probar cada nivel
        for (let level = 1; level <= 5; level++) {
            try {
                const m3u8 = generator.generateM3U8(
                    [testChannel],
                    testServer,
                    {
                        level,
                        optimizations: {
                            proStreaming: true,
                            ottNavigator: true,
                            includeHeaders: true
                        },
                        selectedHeaders: ['User-Agent', 'Referer', 'Cache-Control']
                    }
                );

                // Validar contenido generado
                if (!m3u8.includes('#EXTM3U')) {
                    test.failed++;
                    test.warnings.push(`Level ${level}: Missing #EXTM3U header`);
                } else {
                    test.passed++;
                }

                if (!m3u8.includes('#EXTINF')) {
                    test.failed++;
                    test.warnings.push(`Level ${level}: Missing #EXTINF`);
                } else {
                    test.passed++;
                }

                if (!m3u8.includes(testChannel.name)) {
                    test.failed++;
                    test.warnings.push(`Level ${level}: Missing channel name`);
                } else {
                    test.passed++;
                }

                test.details.push(`Level ${level}: Generated ${m3u8.length} characters`);

            } catch (error) {
                test.failed++;
                test.warnings.push(`Level ${level}: Generation failed - ${error.message}`);
            }
        }

        this.results.push(test);
        console.log(`✅ Test 3 completado: ${test.passed} passed, ${test.failed} failed\n`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ✅ TEST 4: PERFORMANCE HEADERS
     * ═══════════════════════════════════════════════════════════════
     */
    async testHeadersPerformance() {
        console.log('[TEST-SUITE] Test 4: Validando performance de headers...');

        const test = {
            name: 'Headers Performance',
            passed: 0,
            failed: 0,
            warnings: [],
            details: []
        };

        const matrix = window.ULTRA_HEADERS_MATRIX;
        if (!matrix) {
            test.failed++;
            this.results.push(test);
            return;
        }

        // Medir tiempo de generación
        const iterations = 1000;
        const testChannel = {
            stream_id: "perf_test",
            name: "Performance Test",
            heuristics: { bitrate: 25000, codec: "hevc", qualityTier: "4K" }
        };
        const testServer = { baseUrl: "http://test.com:8080", username: "user", password: "pass" };

        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            for (let level = 1; level <= 5; level++) {
                matrix.getAllHeadersForLevel(level, testChannel, testServer);
            }
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;

        test.details.push(`Total iterations: ${iterations}`);
        test.details.push(`Total time: ${totalTime.toFixed(2)}ms`);
        test.details.push(`Average time per generation: ${avgTime.toFixed(4)}ms`);

        if (avgTime < 1) {
            test.passed++;
            test.details.push(`✅ Performance: EXCELLENT (<1ms avg)`);
        } else if (avgTime < 5) {
            test.passed++;
            test.details.push(`✅ Performance: GOOD (<5ms avg)`);
        } else {
            test.failed++;
            test.warnings.push(`Performance below target: ${avgTime.toFixed(2)}ms avg (target: <5ms)`);
        }

        this.results.push(test);
        console.log(`✅ Test 4 completado: Avg time ${avgTime.toFixed(4)}ms\n`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📊 GENERAR REPORTE FINAL
     * ═══════════════════════════════════════════════════════════════
     */
    generateReport() {
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  📊 TEST SUITE REPORT');
        console.log('═══════════════════════════════════════════════════════════════\n');

        let totalPassed = 0;
        let totalFailed = 0;

        this.results.forEach((test, index) => {
            console.log(`${index + 1}. ${test.name}`);
            console.log(`   ✅ Passed: ${test.passed}`);
            console.log(`   ❌ Failed: ${test.failed}`);

            if (test.warnings.length > 0) {
                console.log(`   ⚠️  Warnings:`);
                test.warnings.forEach(warning => {
                    console.log(`      - ${warning}`);
                });
            }

            if (test.details.length > 0) {
                console.log(`   📝 Details:`);
                test.details.forEach(detail => {
                    console.log(`      - ${detail}`);
                });
            }

            console.log('');

            totalPassed += test.passed;
            totalFailed += test.failed;
        });

        const totalTests = totalPassed + totalFailed;
        const successRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(2) : 0;

        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  TOTAL: ${totalPassed}/${totalTests} tests passed (${successRate}%)`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        if (successRate >= 95) {
            console.log('  🎉 ¡EXCELENTE! Sistema listo para producción.');
        } else if (successRate >= 80) {
            console.log('  ✅ BUENO. Revisar warnings antes de producción.');
        } else {
            console.log('  ⚠️  ATENCIÓN. Se requieren ajustes antes de producción.');
        }

        console.log('\n');

        return {
            totalPassed,
            totalFailed,
            successRate: parseFloat(successRate)
        };
    }
}

// Instancia global
window.ultraTestSuite = new UltraTestSuite();

// Comando rápido
window.runHeadersTests = () => window.ultraTestSuite.runAllTests();

console.log('✅ [UltraTestSuite] v1.0 loaded - Run: ultraTestSuite.runAllTests()');
