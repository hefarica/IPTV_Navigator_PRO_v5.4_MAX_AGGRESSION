/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 PROXY AUTH - PRUEBAS DE RENDIMIENTO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests de rendimiento para validar tiempos de respuesta
 * Ejecutar en consola del navegador
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const PerformanceTests = {
        results: {},

        async run() {
            console.log('\n═══════════════════════════════════════════════');
            console.log('📊 PERFORMANCE TESTS');
            console.log('═══════════════════════════════════════════════\n');

            await this.testUserAgentSelection();
            await this.testProxyAuthDetection();
            await this.testStatisticsComputation();

            this.printSummary();

            return this.results;
        },

        // TEST 1: User Agent Selection Performance
        async testUserAgentSelection() {
            console.log('📋 TEST 1: User Agent Selection Performance');

            if (!window.userAgentRotation) {
                console.warn('⚠️ SKIP: userAgentRotation not available');
                return;
            }

            const iterations = 1000;

            console.time(`Select ${iterations} User Agents`);
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                window.userAgentRotation.selectRandomUserAgent();
            }

            const end = performance.now();
            console.timeEnd(`Select ${iterations} User Agents`);

            const totalMs = end - start;
            const avgMs = totalMs / iterations;

            this.results.userAgentSelection = {
                iterations,
                totalMs: totalMs.toFixed(2),
                avgMs: avgMs.toFixed(4),
                status: avgMs < 1 ? 'PASS' : 'WARN'
            };

            console.log(`   Total: ${totalMs.toFixed(2)}ms`);
            console.log(`   Average: ${avgMs.toFixed(4)}ms per selection`);
            console.log(`   Status: ${avgMs < 1 ? '✅ PASS (<1ms)' : '⚠️ WARN (>1ms)'}`);
        },

        // TEST 2: Proxy Auth Detection Performance
        async testProxyAuthDetection() {
            console.log('\n📋 TEST 2: Proxy Auth Detection Performance');

            if (!window.proxyAuthModule) {
                console.warn('⚠️ SKIP: proxyAuthModule not available');
                return;
            }

            const iterations = 1000;
            const mockResponse = {
                status: 407,
                headers: new Map([['Proxy-Authenticate', 'Basic realm="Proxy"']])
            };

            console.time(`Detect 407 x ${iterations}`);
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                window.proxyAuthModule.detectProxyAuthRequired(mockResponse);
            }

            const end = performance.now();
            console.timeEnd(`Detect 407 x ${iterations}`);

            const totalMs = end - start;
            const avgMs = totalMs / iterations;

            this.results.proxyAuthDetection = {
                iterations,
                totalMs: totalMs.toFixed(2),
                avgMs: avgMs.toFixed(4),
                status: avgMs < 1 ? 'PASS' : 'WARN'
            };

            console.log(`   Total: ${totalMs.toFixed(2)}ms`);
            console.log(`   Average: ${avgMs.toFixed(4)}ms per detection`);
            console.log(`   Status: ${avgMs < 1 ? '✅ PASS (<1ms)' : '⚠️ WARN (>1ms)'}`);
        },

        // TEST 3: Statistics Computation Performance
        async testStatisticsComputation() {
            console.log('\n📋 TEST 3: Statistics Computation Performance');

            if (!window.proxyAuthModule) {
                console.warn('⚠️ SKIP: proxyAuthModule not available');
                return;
            }

            const iterations = 1000;

            console.time(`Get statistics x ${iterations}`);
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                window.proxyAuthModule.getStatistics();
            }

            const end = performance.now();
            console.timeEnd(`Get statistics x ${iterations}`);

            const totalMs = end - start;
            const avgMs = totalMs / iterations;

            this.results.statisticsComputation = {
                iterations,
                totalMs: totalMs.toFixed(2),
                avgMs: avgMs.toFixed(4),
                status: avgMs < 1 ? 'PASS' : 'WARN'
            };

            console.log(`   Total: ${totalMs.toFixed(2)}ms`);
            console.log(`   Average: ${avgMs.toFixed(4)}ms per computation`);
            console.log(`   Status: ${avgMs < 1 ? '✅ PASS (<1ms)' : '⚠️ WARN (>1ms)'}`);
        },

        printSummary() {
            console.log('\n═══════════════════════════════════════════════');
            console.log('📊 PERFORMANCE SUMMARY');
            console.log('═══════════════════════════════════════════════\n');

            console.table(this.results);

            const allPass = Object.values(this.results).every(r => r.status === 'PASS');

            if (allPass) {
                console.log('✅ ALL PERFORMANCE TESTS PASSED');
            } else {
                console.log('⚠️ SOME TESTS ARE ABOVE TARGET THRESHOLD');
            }

            console.log('\n═══════════════════════════════════════════════\n');
        }
    };

    // Export
    window.PerformanceTests = PerformanceTests;

    console.log('%c📊 Performance Tests Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   Run: window.PerformanceTests.run()');

})();
