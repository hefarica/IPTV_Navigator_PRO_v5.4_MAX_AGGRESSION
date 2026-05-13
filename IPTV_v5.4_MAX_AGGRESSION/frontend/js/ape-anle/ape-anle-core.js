/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 APE ANLE Core — Orchestrator
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Orchestrates all ANLE modules:
 *   - Opens dictionary on init
 *   - Ensures seed is fresh
 *   - Hooks into app's enrichment pipeline (non-invasive)
 *   - Provides global ANLE.core API
 *
 * Integration strategy:
 *   - Listens for 'channels-loaded' custom event on window
 *   - Wraps existing enrichment if registerAppModule is available
 *   - Falls back to observer pattern (listens for events)
 *   - NEVER modifies existing files
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    let toggleEnabled = (localStorage.getItem('anle.enabled') !== 'false'); // default ON
    let totalBoosts = 0;
    let totalLearned = 0;
    let lastSeedSync = null;
    let initComplete = false;
    let _appRef = null;

    ANLE.core = {
        _registered: false,
        _wrapped: false,
        VERSION: '1.0.0',

        /**
         * Initialize ANLE core.
         * Opens dictionary, ensures seed, hooks into app.
         * @param {Object} [app] - Reference to the app instance (optional)
         */
        async init(app) {
            if (initComplete) {
                console.log('🧬 [ANLE-Core] Already initialized');
                return;
            }

            console.log('🧬 [ANLE-Core] Initializing v' + this.VERSION + '...');
            _appRef = app;

            try {
                // 1. Open dictionary
                await ANLE.dictionary.open();

                // 2. Ensure seed data
                lastSeedSync = await ANLE.seedSyncer.ensureFresh();

                const stats = await ANLE.dictionary.stats();
                console.log(`🧬 [ANLE-Core] Dictionary ready: ${stats.aliases} aliases, ${stats.fingerprints} fingerprints`);

                // 3. Hook into enrichment pipeline
                this._hookEnrichment(app);

                // 4. Listen for channel-load events
                this._listenForChannelEvents();

                initComplete = true;
                this._registered = true;

                console.log(`🧬 [ANLE-Core] ✅ Initialized successfully (toggle: ${toggleEnabled ? 'ON' : 'OFF'})`);
            } catch (e) {
                console.error('🧬 [ANLE-Core] Init error:', e);
            }
        },

        /**
         * Hook into the app's enrichment pipeline.
         * Strategy: Look for registerAppModule, then enrichmentModule, then event-based.
         */
        _hookEnrichment(app) {
            if (this._wrapped) return;

            // Strategy 1: enrichmentModule.enrichChannel (preferred)
            if (app?.enrichmentModule?.enrichChannel) {
                const orig = app.enrichmentModule.enrichChannel.bind(app.enrichmentModule);
                app.enrichmentModule.enrichChannel = (ch) => {
                    const out = orig(ch);
                    if (toggleEnabled) {
                        // Async augmentation — fire-and-forget to not block enrichment
                        this.augment(ch).catch(e => console.error('[ANLE] augment error:', e));
                    }
                    return out;
                };
                this._wrapped = 'enrichmentModule';
                console.log('🧬 [ANLE-Core] Wrapped enrichmentModule.enrichChannel');
                return;
            }

            // Strategy 2: Event-based observation (fallback)
            this._wrapped = 'event-fallback';
            console.log('🧬 [ANLE-Core] Using event-based observation (enrichmentModule not found)');
        },

        /**
         * Listen for custom events that signal channel loading.
         * v1.1: Keeps polling alive to catch new servers, re-imports, and list changes.
         */
        _listenForChannelEvents() {
            // Listen for the app's custom events
            window.addEventListener('lab-imported', (e) => {
                if (!toggleEnabled) return;
                if (e?.detail?.channels) {
                    console.log(`🧬 [ANLE-Core] lab-imported event: ${e.detail.channels.length} channels`);
                    this.processChannelBatch(e.detail.channels);
                }
            });

            // Continuous poll: detect channelsMaster changes (new server, re-import, etc.)
            if (!this._pollingActive) {
                this._pollingActive = true;
                let lastCount = 0;
                let lastProcessedHash = '';
                let processingInFlight = false;

                setInterval(() => {
                    if (!toggleEnabled || processingInFlight) return;
                    // Try app ref first, then window.app
                    const app = _appRef || window.app;
                    const master = app?.state?.channelsMaster;
                    if (!master || master.length === 0) return;

                    // Detect changes: new channels loaded, different count, or new server connected
                    const currentHash = master.length + ':' + (master[0]?.name || '') + ':' + (master[master.length - 1]?.name || '');
                    if (currentHash === lastProcessedHash) return;

                    lastProcessedHash = currentHash;
                    lastCount = master.length;
                    processingInFlight = true;

                    console.log(`🧬 [ANLE-Core] Detected ${master.length} channels — processing ALL`);
                    this.processChannelBatch(master).finally(() => {
                        processingInFlight = false;
                    });
                }, 5000);
            }
        },

        /**
         * Process a batch of channels:
         * 1. Fingerprint the server(s)
         * 2. Augment each channel with ANLE data
         * 3. Run learner on the batch
         */
        async processChannelBatch(channels) {
            if (!toggleEnabled || !channels || channels.length === 0) return;

            const startTime = performance.now();

            // 1. Fingerprint unique servers
            const serverGroups = new Map();
            for (const ch of channels) {
                const sid = ch.serverId || ch._serverId || 'unknown';
                if (!serverGroups.has(sid)) serverGroups.set(sid, []);
                serverGroups.get(sid).push(ch);
            }

            for (const [sid, serverChannels] of serverGroups) {
                const existingFp = await ANLE.dictionary.getFingerprint(sid);
                if (!existingFp) {
                    await ANLE.fingerprint.extractAndPersist(sid, serverChannels);
                }
            }

            // 2. Augment ALL channels — non-blocking microbatches of 500
            //    Yields to event loop every batch to keep UI responsive
            const BATCH_SIZE = 500;
            let augmented = 0;
            let skipped = 0;

            for (let i = 0; i < channels.length; i += BATCH_SIZE) {
                const slice = channels.slice(i, i + BATCH_SIZE);
                for (const ch of slice) {
                    // Skip already-augmented channels (deduplication)
                    if (ch._anleProcessed) { skipped++; continue; }
                    await this.augment(ch);
                    ch._anleProcessed = true;
                    augmented++;
                }
                // Yield to event loop every 500 channels
                if (i + BATCH_SIZE < channels.length) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // 3. Run learner on ALL channels
            const learned = await ANLE.learner.observeBatch(channels);
            totalLearned += learned;

            const elapsed = (performance.now() - startTime).toFixed(1);
            console.log(`🧬 [ANLE-Core] Batch: ${channels.length} total, ${augmented} augmented, ` +
                `${skipped} skipped (already done), ${serverGroups.size} servers, ` +
                `${learned} learned, ${elapsed}ms`);
        },

        /**
         * Augment a single channel with ANLE data.
         * Writes ONLY to ch.anle and ch.anleMediaType — never touches existing fields.
         *
         * @param {Object} ch - Channel object
         */
        async augment(ch) {
            if (!ch) return;

            try {
                // Boost from dictionary
                const boost = await ANLE.booster.computeBoost(ch);
                ch.anle = boost;

                // Classification overlay (for downstream consumers)
                ch.classificationFinal = ANLE.booster.merge(ch, boost);

                // Media type detection
                ch.anleMediaType = ANLE.detection.detectMediaType(ch);

                totalBoosts++;
            } catch (e) {
                // Silent fail — ANLE is non-critical
                if (totalBoosts === 0) {
                    console.warn('🧬 [ANLE] First augment error (subsequent suppressed):', e.message);
                }
            }
        },

        /**
         * Get ANLE statistics.
         * @returns {Promise<Object>}
         */
        async getStats() {
            const dictStats = await ANLE.dictionary.stats();
            return {
                version: this.VERSION,
                aliases: dictStats.aliases,
                fingerprints: dictStats.fingerprints,
                totalBoosts,
                totalLearned,
                lastSeedSync,
                toggleEnabled,
                wrapped: this._wrapped,
                initComplete
            };
        },

        /**
         * Toggle ANLE on/off.
         * @param {boolean} b
         */
        setEnabled(b) {
            toggleEnabled = !!b;
            localStorage.setItem('anle.enabled', String(toggleEnabled));
            console.log(`🧬 [ANLE-Core] Toggle: ${toggleEnabled ? 'ON' : 'OFF'}`);
        },

        /**
         * Check if ANLE is enabled.
         * @returns {boolean}
         */
        isEnabled() {
            return toggleEnabled;
        },

        /**
         * Force re-fingerprint all connected servers.
         */
        async reFingerprint() {
            if (!_appRef?.state?.activeServers) {
                console.warn('🧬 [ANLE-Core] No app reference or no active servers');
                return;
            }

            for (const srv of _appRef.state.activeServers) {
                const channels = (_appRef.state.channelsMaster || []).filter(ch => ch.serverId === srv.id);
                if (channels.length > 0) {
                    await ANLE.fingerprint.extractAndPersist(srv.id, channels);
                }
            }
        }
    };

    // ═══════════════════════════════════════════════════════════
    // AUTO-REGISTRATION
    // ═══════════════════════════════════════════════════════════

    // Strategy 1: registerAppModule exists
    if (typeof window.registerAppModule === 'function') {
        window.registerAppModule('anle', (app) => {
            ANLE.core.init(app).catch(e => console.error('[ANLE-Core] Init error:', e));
        });
        ANLE.core._registered = true;
        console.log('🧬 [ANLE] Core registered with app module queue');
    } else {
        // Strategy 2: Deferred registration (wait for registerAppModule)
        let attempts = 0;
        const maxAttempts = 300; // 30 seconds

        const timer = setInterval(() => {
            attempts++;

            if (typeof window.registerAppModule === 'function') {
                clearInterval(timer);
                window.registerAppModule('anle', (app) => {
                    ANLE.core.init(app).catch(e => console.error('[ANLE-Core] Init error:', e));
                });
                ANLE.core._registered = true;
                console.log('🧬 [ANLE] Core registered (deferred)');
                return;
            }

            // Strategy 3: Direct init without app reference (standalone mode)
            if (attempts >= maxAttempts) {
                clearInterval(timer);
                console.log('🧬 [ANLE] No registerAppModule found — standalone mode');
                ANLE.core.init(null).catch(e => console.error('[ANLE-Core] Standalone init error:', e));
                ANLE.core._registered = true;
            }
        }, 100);
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║ 🧬 APE ANLE v${ANLE.core.VERSION} — Adaptive Nomenclature Learning Engine  ║
╠═══════════════════════════════════════════════════════════════╣
║ ✅ Canonicalize — NFD + TVG-ID normalization                 ║
║ ✅ Dictionary   — IndexedDB (IPTVNavigatorANLE_DB)           ║
║ ✅ Seed Syncer  — iptv-org + offline fallback                ║
║ ✅ Fingerprint  — Per-server nomenclature profiling          ║
║ ✅ Learner      — Consensus-based alias promotion            ║
║ ✅ Detection    — 6-stage media-type (100→50% confidence)    ║
║ ✅ Booster      — Score overlay (no mutation)                ║
║ ✅ Core         — Orchestrator + toggle                      ║
╚═══════════════════════════════════════════════════════════════╝
    `);
})();
