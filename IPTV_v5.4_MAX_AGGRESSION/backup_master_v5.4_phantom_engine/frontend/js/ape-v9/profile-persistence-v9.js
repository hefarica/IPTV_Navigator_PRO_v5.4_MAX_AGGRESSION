/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💾 APE PROFILE PERSISTENCE ENGINE v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages APE profiles with persistence in IndexedDB and localStorage.
 * Includes 4 preset profiles and supports custom profile creation.
 * 
 * Features:
 * - IndexedDB persistence (primary)
 * - localStorage fallback
 * - 4 preset profiles included
 * - Custom profile CRUD operations
 * - Import/export JSON
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
        DB_NAME: 'APE_Profiles_V9',
        DB_VERSION: 1,
        STORE_NAME: 'profiles',
        LOCALSTORAGE_KEY: 'ape_profiles_v9',
        CURRENT_PROFILE_KEY: 'ape_current_profile_v9',
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // PRESET PROFILES
    // ═══════════════════════════════════════════════════════════

    const PRESET_PROFILES = [
        {
            id: 'preset_ultra_premium',
            name: '[PRESET] ULTRA PREMIUM',
            description: 'Maximum performance for professional servers',
            isPreset: true,
            config: {
                bitrate: 'UNLIMITED',
                buffering: 200,
                aggressive: true,
                headerLevel: 5,
                warmup: true,
                entropy: true,
                tlsCoherence: true
            }
        },
        {
            id: 'preset_balanced',
            name: '[PRESET] BALANCED',
            description: 'Good balance of performance and compatibility',
            isPreset: true,
            config: {
                bitrate: 50000,
                buffering: 150,
                aggressive: false,
                headerLevel: 3,
                warmup: true,
                entropy: true,
                tlsCoherence: true
            }
        },
        {
            id: 'preset_resilient',
            name: '[PRESET] RESILIENT',
            description: 'Maximum stability for unstable connections',
            isPreset: true,
            config: {
                bitrate: 30000,
                buffering: 300,
                aggressive: false,
                headerLevel: 2,
                warmup: false,
                entropy: true,
                tlsCoherence: false
            }
        },
        {
            id: 'preset_stealth',
            name: '[PRESET] STEALTH',
            description: 'Maximum evasion for restricted networks',
            isPreset: true,
            config: {
                bitrate: 40000,
                buffering: 180,
                aggressive: true,
                headerLevel: 5,
                warmup: true,
                entropy: true,
                tlsCoherence: true,
                randomizeHeaders: true,
                rotateUA: true
            }
        }
    ];

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    let _db = null;
    let _profiles = new Map();
    let _currentProfileId = null;
    let _dbReady = false;

    // ═══════════════════════════════════════════════════════════
    // INDEXEDDB INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Initialize IndexedDB
     */
    async function initializeDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('[ProfilePersistence] IndexedDB not supported, using localStorage');
                _dbReady = false;
                loadFromLocalStorage();
                resolve(false);
                return;
            }

            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

            request.onerror = () => {
                console.warn('[ProfilePersistence] IndexedDB error, using localStorage');
                _dbReady = false;
                loadFromLocalStorage();
                resolve(false);
            };

            request.onsuccess = (event) => {
                _db = event.target.result;
                _dbReady = true;
                loadFromIndexedDB().then(() => resolve(true));
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                    db.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Load profiles from IndexedDB
     */
    async function loadFromIndexedDB() {
        return new Promise((resolve) => {
            if (!_db) {
                resolve([]);
                return;
            }

            const transaction = _db.transaction([CONFIG.STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const profiles = request.result || [];
                _profiles.clear();

                // Add presets first
                PRESET_PROFILES.forEach(p => _profiles.set(p.id, p));

                // Then add custom profiles
                profiles.forEach(p => {
                    if (!p.isPreset) {
                        _profiles.set(p.id, p);
                    }
                });

                // Load current profile ID
                _currentProfileId = localStorage.getItem(CONFIG.CURRENT_PROFILE_KEY) || 'preset_balanced';

                resolve(Array.from(_profiles.values()));
            };

            request.onerror = () => resolve([]);
        });
    }

    /**
     * Load profiles from localStorage (fallback)
     */
    function loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(CONFIG.LOCALSTORAGE_KEY);
            const profiles = stored ? JSON.parse(stored) : [];

            _profiles.clear();

            // Add presets
            PRESET_PROFILES.forEach(p => _profiles.set(p.id, p));

            // Add custom
            profiles.forEach(p => {
                if (!p.isPreset) {
                    _profiles.set(p.id, p);
                }
            });

            _currentProfileId = localStorage.getItem(CONFIG.CURRENT_PROFILE_KEY) || 'preset_balanced';

        } catch (error) {
            console.error('[ProfilePersistence] localStorage error:', error);
            PRESET_PROFILES.forEach(p => _profiles.set(p.id, p));
        }
    }

    /**
     * Save profiles to storage
     */
    async function saveToStorage() {
        const customProfiles = Array.from(_profiles.values()).filter(p => !p.isPreset);

        // Save to localStorage (always, as backup)
        try {
            localStorage.setItem(CONFIG.LOCALSTORAGE_KEY, JSON.stringify(customProfiles));
            localStorage.setItem(CONFIG.CURRENT_PROFILE_KEY, _currentProfileId);
        } catch (e) {
            console.warn('[ProfilePersistence] localStorage save failed');
        }

        // Save to IndexedDB if available
        if (_db && _dbReady) {
            return new Promise((resolve) => {
                const transaction = _db.transaction([CONFIG.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(CONFIG.STORE_NAME);

                // Clear and re-add all
                store.clear();
                customProfiles.forEach(profile => store.add(profile));

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
            });
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════
    // PROFILE CRUD
    // ═══════════════════════════════════════════════════════════

    /**
     * Create a new profile
     * @param {string} name - Profile name
     * @param {Object} config - Profile configuration
     * @returns {Object} Created profile
     */
    function createProfile(name, config = {}) {
        const id = `profile_${Date.now()}`;
        const profile = {
            id,
            name,
            description: config.description || 'Custom profile',
            isPreset: false,
            config: {
                bitrate: config.bitrate || 50000,
                buffering: config.buffering || 150,
                aggressive: config.aggressive || false,
                headerLevel: config.headerLevel || 3,
                warmup: config.warmup !== false,
                entropy: config.entropy !== false,
                tlsCoherence: config.tlsCoherence !== false,
                ...config
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _profiles.set(id, profile);
        saveToStorage();

        return profile;
    }

    /**
     * Get a profile by ID
     */
    function getProfile(id) {
        return _profiles.get(id) || null;
    }

    /**
     * Update a profile
     */
    function updateProfile(id, updates) {
        const profile = _profiles.get(id);
        if (!profile || profile.isPreset) {
            return { success: false, error: 'Cannot update preset or non-existent profile' };
        }

        const updated = {
            ...profile,
            ...updates,
            id, // Ensure ID doesn't change
            isPreset: false,
            updatedAt: Date.now()
        };

        _profiles.set(id, updated);
        saveToStorage();

        return { success: true, profile: updated };
    }

    /**
     * Delete a profile
     */
    function deleteProfile(id) {
        const profile = _profiles.get(id);
        if (!profile) {
            return { success: false, error: 'Profile not found' };
        }
        if (profile.isPreset) {
            return { success: false, error: 'Cannot delete preset profiles' };
        }

        _profiles.delete(id);

        // Reset current if deleted
        if (_currentProfileId === id) {
            _currentProfileId = 'preset_balanced';
        }

        saveToStorage();

        return { success: true };
    }

    /**
     * List all profiles
     */
    function listProfiles() {
        return Array.from(_profiles.values());
    }

    // ═══════════════════════════════════════════════════════════
    // CURRENT PROFILE
    // ═══════════════════════════════════════════════════════════

    /**
     * Set current active profile
     */
    function setCurrentProfile(id) {
        if (!_profiles.has(id)) {
            return { success: false, error: 'Profile not found' };
        }

        _currentProfileId = id;
        localStorage.setItem(CONFIG.CURRENT_PROFILE_KEY, id);

        return { success: true, profile: _profiles.get(id) };
    }

    /**
     * Get current active profile
     */
    function getCurrentProfile() {
        return _profiles.get(_currentProfileId) || _profiles.get('preset_balanced');
    }

    // ═══════════════════════════════════════════════════════════
    // IMPORT/EXPORT
    // ═══════════════════════════════════════════════════════════

    /**
     * Export all profiles to JSON
     */
    function exportToJSON() {
        const data = {
            version: CONFIG.VERSION,
            exportedAt: Date.now(),
            currentProfile: _currentProfileId,
            profiles: Array.from(_profiles.values()).filter(p => !p.isPreset)
        };

        return JSON.stringify(data, null, 2);
    }

    /**
     * Import profiles from JSON
     */
    function importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (!data.profiles || !Array.isArray(data.profiles)) {
                return { success: false, error: 'Invalid format' };
            }

            let imported = 0;
            data.profiles.forEach(profile => {
                if (!profile.isPreset && profile.id && profile.name) {
                    profile.id = `profile_${Date.now()}_${imported}`;  // New ID
                    profile.isPreset = false;
                    _profiles.set(profile.id, profile);
                    imported++;
                }
            });

            saveToStorage();

            return { success: true, imported };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        return {
            version: CONFIG.VERSION,
            totalProfiles: _profiles.size,
            customProfiles: Array.from(_profiles.values()).filter(p => !p.isPreset).length,
            presetProfiles: PRESET_PROFILES.length,
            currentProfile: getCurrentProfile()?.name,
            storageType: _dbReady ? 'IndexedDB' : 'localStorage',
            ready: true
        };
    }

    // ═══════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    // Auto-initialize on load
    initializeDB().then(() => {
        if (CONFIG.DEBUG) {
            console.log('[ProfilePersistence] Initialized:', getStatus());
        }
    });

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const ProfilePersistenceEngine = {
        // CRUD
        createProfile,
        getProfile,
        updateProfile,
        deleteProfile,
        listProfiles,

        // Current profile
        setCurrentProfile,
        getCurrentProfile,

        // Import/Export
        exportToJSON,
        importFromJSON,

        // Initialization
        initializeDB,

        // Status
        getStatus,

        // Data
        PRESET_PROFILES,
        profiles: _profiles,

        // Config
        CONFIG
    };

    // Global exports
    window.PROFILE_PERSISTENCE_V9 = ProfilePersistenceEngine;
    window.APE_Profiles = ProfilePersistenceEngine;  // Alias

    console.log('%c💾 APE Profile Persistence Engine v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
