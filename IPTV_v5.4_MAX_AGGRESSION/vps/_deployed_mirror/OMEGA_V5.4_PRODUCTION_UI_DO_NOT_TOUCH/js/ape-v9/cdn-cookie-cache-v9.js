/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🍪 APE CDN COOKIE CACHE v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Caches CDN authentication cookies (Cloudflare cf_clearance, etc) for 48h reuse.
 * Prevents unnecessary challenge solve on each request.
 * 
 * Features:
 * - IndexedDB + localStorage persistence
 * - Automatic TTL management (48h default)
 * - Domain-based cookie storage
 * - Auto-cleanup of expired cookies
 * 
 * @version 9.0.0
 * @date 2024-12-30
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '9.0.0',
        DB_NAME: 'APE_CookieCache_V9',
        DB_VERSION: 1,
        STORE_NAME: 'cookies',
        DEFAULT_TTL_MS: 48 * 60 * 60 * 1000,  // 48 hours
        CLEANUP_INTERVAL_MS: 60 * 60 * 1000,  // 1 hour
        LOCALSTORAGE_KEY: 'ape_cookie_cache_v9',
        DEBUG: false
    };

    // Cookie types to cache
    const COOKIE_PATTERNS = [
        'cf_clearance',       // Cloudflare
        '__cf_bm',            // Cloudflare bot management
        '_cfuvid',            // Cloudflare visitor ID
        'ak_bmsc',            // Akamai bot manager
        'bm_sv',              // Akamai session
        '_abck',              // Akamai antibot
        'datadome',           // DataDome
        'AWSALB',             // AWS ALB
        'AWSALBCORS'          // AWS ALB CORS
    ];

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    let _db = null;
    let _cache = new Map();  // domain -> { cookies, expires }
    let _dbReady = false;
    let _cleanupTimer = null;

    // ═══════════════════════════════════════════════════════════
    // INDEXEDDB
    // ═══════════════════════════════════════════════════════════

    async function initializeDB() {
        return new Promise((resolve) => {
            if (!window.indexedDB) {
                _dbReady = false;
                loadFromLocalStorage();
                resolve(false);
                return;
            }

            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

            request.onerror = () => {
                _dbReady = false;
                loadFromLocalStorage();
                resolve(false);
            };

            request.onsuccess = (event) => {
                _db = event.target.result;
                _dbReady = true;
                loadFromIndexedDB().then(() => {
                    startCleanupTimer();
                    resolve(true);
                });
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                    const store = db.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'domain' });
                    store.createIndex('expires', 'expires', { unique: false });
                }
            };
        });
    }

    async function loadFromIndexedDB() {
        return new Promise((resolve) => {
            if (!_db) {
                resolve();
                return;
            }

            const transaction = _db.transaction([CONFIG.STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const entries = request.result || [];
                _cache.clear();

                const now = Date.now();
                entries.forEach(entry => {
                    if (entry.expires > now) {
                        _cache.set(entry.domain, entry);
                    }
                });

                resolve();
            };

            request.onerror = () => resolve();
        });
    }

    function loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(CONFIG.LOCALSTORAGE_KEY);
            const entries = stored ? JSON.parse(stored) : [];

            _cache.clear();
            const now = Date.now();

            entries.forEach(entry => {
                if (entry.expires > now) {
                    _cache.set(entry.domain, entry);
                }
            });
        } catch (e) {
            console.warn('[CookieCache] localStorage load failed');
        }
    }

    async function saveToStorage() {
        const entries = Array.from(_cache.values());

        // localStorage backup
        try {
            localStorage.setItem(CONFIG.LOCALSTORAGE_KEY, JSON.stringify(entries));
        } catch (e) { }

        // IndexedDB
        if (_db && _dbReady) {
            return new Promise((resolve) => {
                const transaction = _db.transaction([CONFIG.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(CONFIG.STORE_NAME);

                // Clear and re-add
                store.clear();
                entries.forEach(entry => store.add(entry));

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
            });
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════
    // COOKIE OPERATIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Save cookies for a domain
     * @param {string} domain - Domain name
     * @param {string} cookieString - Full cookie string
     * @param {number} ttl - Time to live in ms (default 48h)
     */
    async function saveCookies(domain, cookieString, ttl = CONFIG.DEFAULT_TTL_MS) {
        if (!domain || !cookieString) return false;

        // Normalize domain
        const normalizedDomain = normalizeDomain(domain);

        // Parse and filter relevant cookies
        const relevantCookies = parseRelevantCookies(cookieString);

        if (relevantCookies.length === 0) {
            if (CONFIG.DEBUG) {
                console.log('[CookieCache] No relevant cookies to cache');
            }
            return false;
        }

        const entry = {
            domain: normalizedDomain,
            cookies: relevantCookies,
            cookieString: relevantCookies.map(c => `${c.name}=${c.value}`).join('; '),
            savedAt: Date.now(),
            expires: Date.now() + ttl
        };

        _cache.set(normalizedDomain, entry);
        await saveToStorage();

        if (CONFIG.DEBUG) {
            console.log(`[CookieCache] Saved ${relevantCookies.length} cookies for ${normalizedDomain}`);
        }

        return true;
    }

    /**
     * Get cached cookies for a domain
     * @param {string} domain - Domain name
     * @returns {string|null} Cookie string or null if not cached/expired
     */
    function getCachedCookies(domain) {
        const normalizedDomain = normalizeDomain(domain);
        const entry = _cache.get(normalizedDomain);

        if (!entry) return null;

        // Check if expired
        if (entry.expires < Date.now()) {
            _cache.delete(normalizedDomain);
            return null;
        }

        return entry.cookieString;
    }

    /**
     * Check if cookies are cached for a domain
     */
    function hasCachedCookies(domain) {
        return getCachedCookies(domain) !== null;
    }

    /**
     * Clear cookies for a domain
     */
    async function clearCookies(domain) {
        const normalizedDomain = normalizeDomain(domain);
        _cache.delete(normalizedDomain);
        await saveToStorage();
    }

    /**
     * Clear all cached cookies
     */
    async function clearAll() {
        _cache.clear();
        await saveToStorage();
    }

    // ═══════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════

    function normalizeDomain(domain) {
        return domain
            .replace(/^https?:\/\//i, '')
            .replace(/[:\/].*$/, '')
            .toLowerCase();
    }

    function parseRelevantCookies(cookieString) {
        const cookies = [];

        // Split by ; and process each cookie
        cookieString.split(';').forEach(part => {
            const [nameValue] = part.trim().split(';');
            if (!nameValue) return;

            const eqIndex = nameValue.indexOf('=');
            if (eqIndex === -1) return;

            const name = nameValue.substring(0, eqIndex).trim();
            const value = nameValue.substring(eqIndex + 1).trim();

            // Check if it's a cookie we care about
            if (COOKIE_PATTERNS.some(pattern => name.includes(pattern))) {
                cookies.push({ name, value });
            }
        });

        return cookies;
    }

    // ═══════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════

    function startCleanupTimer() {
        if (_cleanupTimer) clearInterval(_cleanupTimer);

        _cleanupTimer = setInterval(() => {
            cleanupExpired();
        }, CONFIG.CLEANUP_INTERVAL_MS);
    }

    async function cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const [domain, entry] of _cache) {
            if (entry.expires < now) {
                _cache.delete(domain);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            await saveToStorage();
            if (CONFIG.DEBUG) {
                console.log(`[CookieCache] Cleaned ${cleaned} expired entries`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        const entries = Array.from(_cache.values());
        const now = Date.now();

        return {
            version: CONFIG.VERSION,
            totalCached: entries.length,
            domains: entries.map(e => ({
                domain: e.domain,
                cookies: e.cookies.length,
                expiresIn: Math.round((e.expires - now) / 1000 / 60) + ' min'
            })),
            storageType: _dbReady ? 'IndexedDB' : 'localStorage',
            ready: true
        };
    }

    // ═══════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    initializeDB().then(() => {
        if (CONFIG.DEBUG) {
            console.log('[CookieCache] Initialized:', getStatus());
        }
    });

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const CDNCookieCache = {
        // Cookie operations
        saveCookies,
        getCachedCookies,
        hasCachedCookies,
        clearCookies,
        clearAll,

        // Initialization
        initializeDB,

        // Cleanup
        cleanupExpired,

        // Status
        getStatus,

        // Data
        COOKIE_PATTERNS,
        cache: _cache,

        // Config
        CONFIG
    };

    // Global exports
    window.CDN_COOKIE_CACHE_V9 = CDNCookieCache;
    window.APE_CookieCache = CDNCookieCache;  // Alias

    console.log('%c🍪 APE CDN Cookie Cache v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
