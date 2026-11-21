/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Complete Test Harness
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Convention: window.ANLETests.runAll()
 * Matches project standard: window.<TestSuite>.runAll()
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLETests = window.ANLETests = {
        tests: [],
        failures: [],
        version: '1.0.0'
    };

    // ═══════════════════════════════════════════════════════════
    // CANONICALIZE TESTS (Task 2)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'canonicalize: dispatcharr TVG-ID normalization',
        fn: () => {
            // TVG-ID dot-stripping: 'FOO1.xx' and 'foo.1.xx' should both → 'foo1xx'
            const a = ANLE.canonicalize('FOO1.xx');
            const b = ANLE.canonicalize('foo.1.xx');
            if (a !== b) throw new Error(`Dot-strip mismatch: ${a} | ${b}`);
            if (a !== 'foo1xx') throw new Error(`Expected 'foo1xx', got '${a}'`);
            // Space-separated tokens are preserved (correct for dictionary matching)
            const c = ANLE.canonicalize('Foo 1 XX');
            if (c !== 'foo 1 xx') throw new Error(`Expected 'foo 1 xx', got '${c}'`);
        }
    });

    ANLETests.tests.push({
        name: 'canonicalize: strip diacritics LATAM accents',
        fn: () => {
            const out = ANLE.canonicalize('Canal Único');
            if (out !== 'canal unico') throw new Error(`Expected 'canal unico', got '${out}'`);
        }
    });

    ANLETests.tests.push({
        name: 'canonicalize: emoji stripped, tokens preserved',
        fn: () => {
            const out = ANLE.canonicalize('🇨🇴 Caracol HD');
            if (!out.includes('caracol') || !out.includes('hd')) throw new Error(`Got '${out}'`);
        }
    });

    ANLETests.tests.push({
        name: 'canonicalize: null/undefined → empty string',
        fn: () => {
            if (ANLE.canonicalize(null) !== '') throw new Error('null failed');
            if (ANLE.canonicalize(undefined) !== '') throw new Error('undefined failed');
            if (ANLE.canonicalize('') !== '') throw new Error('empty string failed');
        }
    });

    ANLETests.tests.push({
        name: 'canonicalize: Turkish İ/ı normalized',
        fn: () => {
            const out = ANLE.canonicalize('İstanbul Kanalı');
            if (!out.includes('istanbul')) throw new Error(`Got '${out}'`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // DICTIONARY TESTS (Task 3)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'dictionary: open DB creates 2 stores',
        fn: async () => {
            await ANLE.dictionary.open();
            const stores = ANLE.dictionary._db.objectStoreNames;
            if (!stores.contains('aliases') || !stores.contains('fingerprints')) {
                throw new Error(`Stores: ${Array.from(stores).join(',')}`);
            }
        }
    });

    ANLETests.tests.push({
        name: 'dictionary: putAlias + getAlias roundtrip',
        fn: async () => {
            await ANLE.dictionary.putAlias({
                id: 'test_lat',
                canonical: 'LATAM',
                variants: ['LAT', 'LA', 'LATIN'],
                weight: 30
            });
            const got = await ANLE.dictionary.getAlias('test_lat');
            if (!got || got.canonical !== 'LATAM') throw new Error(`Got: ${JSON.stringify(got)}`);
        }
    });

    ANLETests.tests.push({
        name: 'dictionary: queryByVariant finds canonical',
        fn: async () => {
            // Put an entry with known variant
            await ANLE.dictionary.putAlias({
                id: 'test_variant_query',
                canonical: 'LATAM_QUERY',
                variants: ['latin_test_query'],
                weight: 30
            });
            const hit = await ANLE.dictionary.queryByVariant('latin_test_query');
            if (!hit || hit.canonical !== 'LATAM_QUERY') throw new Error(`Got: ${JSON.stringify(hit)}`);
        }
    });

    ANLETests.tests.push({
        name: 'dictionary: putAliasBulk inserts multiple',
        fn: async () => {
            const entries = [
                { id: 'bulk1', canonical: 'BULK1', variants: ['b1'], weight: 10 },
                { id: 'bulk2', canonical: 'BULK2', variants: ['b2'], weight: 10 },
                { id: 'bulk3', canonical: 'BULK3', variants: ['b3'], weight: 10 }
            ];
            const n = await ANLE.dictionary.putAliasBulk(entries);
            if (n !== 3) throw new Error(`Expected 3, got ${n}`);
            const got = await ANLE.dictionary.getAlias('bulk2');
            if (!got || got.canonical !== 'BULK2') throw new Error(`bulk2 not found`);
        }
    });

    ANLETests.tests.push({
        name: 'dictionary: stats returns counts',
        fn: async () => {
            const stats = await ANLE.dictionary.stats();
            if (typeof stats.aliases !== 'number' || typeof stats.fingerprints !== 'number') {
                throw new Error(`Bad stats: ${JSON.stringify(stats)}`);
            }
        }
    });

    // ═══════════════════════════════════════════════════════════
    // SEED SYNCER TESTS (Task 4)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'seed-syncer: loadFallback loads >= 50 entries',
        fn: async () => {
            const count = await ANLE.seedSyncer.loadFallback();
            if (count < 50) throw new Error(`Expected >=50 fallback entries, got ${count}`);
        }
    });

    ANLETests.tests.push({
        name: 'seed-syncer: fallback creates queryable entries',
        fn: async () => {
            // After loading fallback, Rai 1 should be queryable
            const hit = await ANLE.dictionary.queryByVariant('rai 1');
            if (!hit) throw new Error('Rai 1 should be queryable post-seed');
            if (hit.country !== 'it') throw new Error(`Expected country 'it', got '${hit.country}'`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // BOOSTER TESTS (Task 5)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'booster: empty channel returns zero deltas',
        fn: async () => {
            const b = await ANLE.booster.computeBoost({ name: '', group_title: '', country: 'INT', language: 'MIX' });
            if (b.region_boost !== 0 || b.lang_boost !== 0) throw new Error(`Got: ${JSON.stringify(b)}`);
        }
    });

    ANLETests.tests.push({
        name: 'booster: known seed entry gives positive boost',
        fn: async () => {
            // ESPN is in the seed as sports
            const b = await ANLE.booster.computeBoost({ name: 'ESPN HD', group_title: 'Sports', country: 'INT', language: 'MIX' });
            if (b.learned_aliases_hit.length === 0) throw new Error(`No hits found for ESPN HD`);
        }
    });

    ANLETests.tests.push({
        name: 'booster: NEVER mutates ch.country or ch.language',
        fn: async () => {
            const ch = { name: 'ESPN HD', country: 'XX', language: 'YY', group_title: '' };
            await ANLE.booster.computeBoost(ch);
            if (ch.country !== 'XX') throw new Error(`country mutated to '${ch.country}'`);
            if (ch.language !== 'YY') throw new Error(`language mutated to '${ch.language}'`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // FINGERPRINT TESTS (Task 6)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'fingerprint: extracts ISO prefixes from sample',
        fn: () => {
            const sample = [
                { name: 'CO: Caracol HD', group_title: '🇨🇴 Colombia' },
                { name: 'CO: RCN HD', group_title: '🇨🇴 Colombia' },
                { name: 'MX: Televisa', group_title: '🇲🇽 Mexico' },
                { name: 'AR: TyC Sports', group_title: '🇦🇷 Argentina' }
            ];
            const fp = ANLE.fingerprint.extract('test-server-fp', sample);
            if (!fp.prefixes['co'] || fp.prefixes['co'].count < 2) {
                throw new Error(`prefixes: ${JSON.stringify(fp.prefixes)}`);
            }
            if (!fp.separators.includes(':')) {
                throw new Error(`Expected ':' separator, got: ${fp.separators}`);
            }
        }
    });

    ANLETests.tests.push({
        name: 'fingerprint: persists to IndexedDB roundtrip',
        fn: async () => {
            const sample = [{ name: 'CO: X', group_title: '' }];
            const fp = ANLE.fingerprint.extract('persist-test-fp', sample);
            await ANLE.dictionary.putFingerprint(fp);
            const got = await ANLE.dictionary.getFingerprint('persist-test-fp');
            if (!got || got.serverId !== 'persist-test-fp') throw new Error(`Got: ${JSON.stringify(got)}`);
        }
    });

    ANLETests.tests.push({
        name: 'fingerprint: detects emoji flags',
        fn: () => {
            const sample = [
                { name: '🇨🇴 Caracol', group_title: '' },
                { name: '🇨🇴 RCN', group_title: '' },
                { name: '🇲🇽 Televisa', group_title: '' }
            ];
            const fp = ANLE.fingerprint.extract('flag-test', sample);
            if (!fp.flagCountries['co'] || fp.flagCountries['co'] < 2) {
                throw new Error(`flagCountries: ${JSON.stringify(fp.flagCountries)}`);
            }
        }
    });

    // ═══════════════════════════════════════════════════════════
    // LEARNER TESTS (Task 7)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'learner: token seen >=3 times with confidence>0.7 promotes to alias',
        fn: async () => {
            const enriched = [
                { name: 'FUTECAS Real Madrid', country: 'ES', _classConfidence: 0.85, _classCategory: 'DEPORTES' },
                { name: 'FUTECAS Liga MX', country: 'MX', _classConfidence: 0.8, _classCategory: 'DEPORTES' },
                { name: 'FUTECAS Champions', country: 'GB', _classConfidence: 0.9, _classCategory: 'DEPORTES' }
            ];
            await ANLE.learner.observeBatch(enriched);
            const hit = await ANLE.dictionary.queryByVariant('futecas');
            if (!hit) throw new Error('FUTECAS should have been learned');
            if (!hit.categories || !hit.categories.includes('DEPORTES')) {
                throw new Error(`No DEPORTES in categories: ${JSON.stringify(hit)}`);
            }
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 6-STAGE DETECTION TESTS (Task 8)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: '6stage: explicit tvg-type wins (100% confidence)',
        fn: () => {
            const r = ANLE.detection.detectMediaType({ 'tvg-type': 'live', name: 'X' });
            if (r.type !== 'live' || r.confidence !== 100) throw new Error(JSON.stringify(r));
        }
    });

    ANLETests.tests.push({
        name: '6stage: S01E02 → series (80% confidence)',
        fn: () => {
            const r = ANLE.detection.detectMediaType({ name: 'Breaking Bad S01E02', url: 'http://x.com/y' });
            if (r.type !== 'series') throw new Error(JSON.stringify(r));
            if (r.confidence !== 80) throw new Error(`Expected 80, got ${r.confidence}`);
        }
    });

    ANLETests.tests.push({
        name: '6stage: /vod/ in URL → vod (70% confidence)',
        fn: () => {
            const r = ANLE.detection.detectMediaType({ name: 'Movie X', url: 'http://srv/vod/movie/123.mp4' });
            if (r.type !== 'vod') throw new Error(JSON.stringify(r));
            if (r.confidence !== 70) throw new Error(`Expected 70, got ${r.confidence}`);
        }
    });

    ANLETests.tests.push({
        name: '6stage: /live/ in URL → live (70% confidence)',
        fn: () => {
            const r = ANLE.detection.detectMediaType({ name: 'Canal X', url: 'http://srv/live/user/pass/123.m3u8' });
            if (r.type !== 'live') throw new Error(JSON.stringify(r));
        }
    });

    ANLETests.tests.push({
        name: '6stage: unknown returns 0 confidence',
        fn: () => {
            const r = ANLE.detection.detectMediaType({ name: 'Something', url: '' });
            if (r.type !== 'unknown' || r.confidence !== 0) throw new Error(JSON.stringify(r));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CORE ORCHESTRATOR TESTS (Task 9)
    // ═══════════════════════════════════════════════════════════

    ANLETests.tests.push({
        name: 'core: ANLE.core exists and has getStats',
        fn: () => {
            if (!window.ANLE.core) throw new Error('ANLE.core missing');
            if (typeof ANLE.core.getStats !== 'function') throw new Error('getStats missing');
        }
    });

    ANLETests.tests.push({
        name: 'core: augment writes ch.anle without mutating ch.country',
        fn: async () => {
            const ch = { name: 'ESPN HD', country: 'INT', language: 'MIX', group_title: '' };
            await ANLE.core.augment(ch);
            if (!ch.anle) throw new Error('ch.anle missing after augment');
            if (ch.country !== 'INT') throw new Error(`country mutated to '${ch.country}'`);
            if (ch.language !== 'MIX') throw new Error(`language mutated to '${ch.language}'`);
        }
    });

    ANLETests.tests.push({
        name: 'core: augment writes ch.anleMediaType',
        fn: async () => {
            const ch = { name: 'Movie X', url: 'http://srv/vod/123.mp4', country: 'INT', language: 'MIX' };
            await ANLE.core.augment(ch);
            if (!ch.anleMediaType) throw new Error('ch.anleMediaType missing');
            if (ch.anleMediaType.type !== 'vod') throw new Error(`Expected vod, got ${ch.anleMediaType.type}`);
        }
    });

    ANLETests.tests.push({
        name: 'core: toggle on/off persists to localStorage',
        fn: () => {
            const before = ANLE.core.isEnabled();
            ANLE.core.setEnabled(false);
            if (localStorage.getItem('anle.enabled') !== 'false') throw new Error('localStorage not updated');
            ANLE.core.setEnabled(true);
            if (localStorage.getItem('anle.enabled') !== 'true') throw new Error('localStorage not restored');
            ANLE.core.setEnabled(before); // restore original
        }
    });

    // ═══════════════════════════════════════════════════════════
    // TEST RUNNER
    // ═══════════════════════════════════════════════════════════

    ANLETests.runAll = async function () {
        console.group('🧬 ANLE Tests v' + ANLETests.version);
        let pass = 0, fail = 0;
        ANLETests.failures = [];

        for (const t of ANLETests.tests) {
            try {
                await t.fn();
                pass++;
                console.log('  ✅', t.name);
            } catch (e) {
                fail++;
                ANLETests.failures.push({ name: t.name, error: e.message });
                console.error('  ❌', t.name, '—', e.message);
            }
        }

        const status = fail === 0 ? '🟢 ALL PASS' : `🔴 ${fail} FAILURES`;
        console.log(`\n📊 ANLE Tests: ${pass} pass / ${fail} fail (${ANLETests.tests.length} total) — ${status}`);
        console.groupEnd();
        return { pass, fail, total: ANLETests.tests.length, failures: ANLETests.failures };
    };

    console.log(`🧬 [ANLE] Test harness loaded (${ANLETests.tests.length} tests registered)`);
})();
