/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌐 APE MULTI-SERVER FUSION ENGINE v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Connects to multiple IPTV servers in parallel and fuses their channel catalogs.
 * Handles up to 400K+ channels with automatic deduplication.
 * 
 * Features:
 * - Parallel server connection (configurable concurrency)
 * - Automatic channel deduplication by URL
 * - Fallback/redundancy management
 * - Connection health monitoring
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
        MAX_CONCURRENT: 5,          // Max parallel connections
        TIMEOUT_MS: 30000,          // 30 second timeout per server
        RETRY_ATTEMPTS: 2,          // Retry failed connections
        RETRY_DELAY_MS: 2000,       // Delay between retries
        DEDUPE_STRATEGY: 'url',     // 'url' | 'name' | 'both'
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    const _servers = new Map();
    let _catalogMaster = [];
    let _connectionStatus = new Map();

    // ═══════════════════════════════════════════════════════════
    // SERVER MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * Add a server to the pool
     * @param {Object} server - Server config {id, name, baseUrl, username, password}
     */
    function addServer(server) {
        if (!server.id || !server.baseUrl) {
            throw new Error('Server must have id and baseUrl');
        }

        _servers.set(server.id, {
            ...server,
            status: 'disconnected',
            channels: [],
            lastConnect: null,
            errorCount: 0
        });

        if (CONFIG.DEBUG) {
            console.log(`[MultiServer] Added server: ${server.name || server.id}`);
        }

        return { success: true, serverId: server.id };
    }

    /**
     * Remove a server from the pool
     */
    function removeServer(serverId) {
        if (_servers.has(serverId)) {
            _servers.delete(serverId);
            return { success: true };
        }
        return { success: false, error: 'Server not found' };
    }

    /**
     * Get all registered servers
     */
    function getServers() {
        return Array.from(_servers.values());
    }

    // ═══════════════════════════════════════════════════════════
    // CONNECTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Connect to a single server
     * @param {string} serverId - Server ID
     * @returns {Promise<Object>} Connection result
     */
    async function connectSingleServer(serverId) {
        const server = _servers.get(serverId);
        if (!server) {
            return { success: false, error: 'Server not found' };
        }

        const startTime = Date.now();

        try {
            // Build API URL
            const apiUrl = buildApiUrl(server, 'get_live_streams');

            // Fetch with timeout
            const response = await Promise.race([
                fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), CONFIG.TIMEOUT_MS)
                )
            ]);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const channels = await response.json();

            // Update server state
            server.status = 'connected';
            server.channels = Array.isArray(channels) ? channels : [];
            server.lastConnect = Date.now();
            server.responseTime = Date.now() - startTime;
            server.errorCount = 0;

            _servers.set(serverId, server);

            return {
                success: true,
                serverId,
                channelCount: server.channels.length,
                responseTime: server.responseTime
            };

        } catch (error) {
            server.status = 'error';
            server.errorCount++;
            server.lastError = error.message;
            _servers.set(serverId, server);

            return {
                success: false,
                serverId,
                error: error.message,
                retryable: server.errorCount < CONFIG.RETRY_ATTEMPTS
            };
        }
    }

    /**
     * Build Xtream API URL
     */
    function buildApiUrl(server, action) {
        const base = server.baseUrl.replace(/\/$/, '');
        return `${base}/player_api.php?username=${encodeURIComponent(server.username)}&password=${encodeURIComponent(server.password)}&action=${action}`;
    }

    /**
     * Connect to all servers in parallel
     * @returns {Promise<Object>} Results of all connections
     */
    async function connectAllServersParallel() {
        const serverIds = Array.from(_servers.keys());

        if (serverIds.length === 0) {
            return { success: false, error: 'No servers registered' };
        }

        console.log(`[MultiServer] Connecting to ${serverIds.length} servers...`);

        // Process in batches of MAX_CONCURRENT
        const results = {
            successful: [],
            failed: [],
            totalChannels: 0,
            startTime: Date.now()
        };

        for (let i = 0; i < serverIds.length; i += CONFIG.MAX_CONCURRENT) {
            const batch = serverIds.slice(i, i + CONFIG.MAX_CONCURRENT);
            const batchResults = await Promise.all(
                batch.map(id => connectSingleServer(id))
            );

            batchResults.forEach(result => {
                if (result.success) {
                    results.successful.push(result);
                    results.totalChannels += result.channelCount;
                } else {
                    results.failed.push(result);
                }
            });
        }

        results.duration = Date.now() - results.startTime;
        results.success = results.successful.length > 0;

        console.log(`[MultiServer] Connected: ${results.successful.length}/${serverIds.length} servers, ${results.totalChannels} channels`);

        return results;
    }

    // ═══════════════════════════════════════════════════════════
    // CATALOG FUSION
    // ═══════════════════════════════════════════════════════════

    /**
     * Merge all server catalogs with deduplication
     * @param {Array} connectedServers - Array of successful connection results
     * @returns {Object} Merge statistics
     */
    function mergeCatalogsWithDeduplic(connectedServers = null) {
        const allChannels = [];
        const seenUrls = new Set();
        const seenNames = new Set();
        let duplicatesRemoved = 0;
        let channelsWithBackups = 0;

        // Get channels from all connected servers
        const servers = connectedServers ||
            Array.from(_servers.values()).filter(s => s.status === 'connected');

        servers.forEach((server, serverIndex) => {
            const serverData = typeof server === 'object' && server.serverId
                ? _servers.get(server.serverId)
                : server;

            if (!serverData || !serverData.channels) return;

            serverData.channels.forEach(channel => {
                const channelUrl = channel.url || channel.stream_url || '';
                const channelName = channel.name || channel.stream_name || '';

                if (CONFIG.DEDUPE_STRATEGY === 'url' || CONFIG.DEDUPE_STRATEGY === 'both') {
                    if (seenUrls.has(channelUrl)) {
                        duplicatesRemoved++;
                        // Add as backup source
                        const existing = allChannels.find(c => (c.url || c.stream_url) === channelUrl);
                        if (existing) {
                            if (!existing._backupSources) existing._backupSources = [];
                            existing._backupSources.push({
                                serverId: serverData.id,
                                url: channelUrl
                            });
                            channelsWithBackups++;
                        }
                        return;
                    }
                    seenUrls.add(channelUrl);
                }

                if (CONFIG.DEDUPE_STRATEGY === 'name' || CONFIG.DEDUPE_STRATEGY === 'both') {
                    if (seenNames.has(channelName.toLowerCase())) {
                        duplicatesRemoved++;
                        return;
                    }
                    seenNames.add(channelName.toLowerCase());
                }

                // Add server source metadata
                channel._source = serverData.id;
                channel._sourceServer = serverData.name || serverData.id;

                allChannels.push(channel);
            });
        });

        _catalogMaster = allChannels;

        const result = {
            totalChannels: allChannels.length,
            duplicatesRemoved,
            channelsWithBackups,
            serversProcessed: servers.length,
            timestamp: Date.now()
        };

        console.log(`[MultiServer] Catalog merged: ${result.totalChannels} unique channels, ${duplicatesRemoved} duplicates removed`);

        return result;
    }

    /**
     * Get the master catalog
     */
    function getCatalog() {
        return _catalogMaster;
    }

    /**
     * Search channels across all servers
     * @param {string} query - Search query
     * @param {Object} options - Search options
     */
    function searchChannels(query, options = {}) {
        const { limit = 100, group = null, quality = null } = options;
        const lowerQuery = query.toLowerCase();

        return _catalogMaster
            .filter(ch => {
                const name = (ch.name || ch.stream_name || '').toLowerCase();
                const matchesQuery = name.includes(lowerQuery);
                const matchesGroup = !group || (ch.group_title || ch.category_name || '') === group;
                const matchesQuality = !quality || name.includes(quality.toLowerCase());

                return matchesQuery && matchesGroup && matchesQuality;
            })
            .slice(0, limit);
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK & REDUNDANCY
    // ═══════════════════════════════════════════════════════════

    /**
     * Get backup sources for a channel
     * @param {Object} channel - Channel object
     * @returns {Array} Alternative URLs
     */
    function getBackupSources(channel) {
        const backups = channel._backupSources || [];
        return backups.map(b => {
            const server = _servers.get(b.serverId);
            return {
                url: b.url,
                serverName: server ? server.name : b.serverId,
                serverStatus: server ? server.status : 'unknown'
            };
        });
    }

    /**
     * Get channel with fallback support
     * @param {string} channelId - Channel identifier
     * @returns {Object} Channel with fallback info
     */
    function getChannelWithFallback(channelId) {
        const channel = _catalogMaster.find(ch =>
            ch.stream_id == channelId || ch.id == channelId
        );

        if (!channel) return null;

        return {
            ...channel,
            primary: channel.url || channel.stream_url,
            backups: getBackupSources(channel),
            hasRedundancy: (channel._backupSources || []).length > 0
        };
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        const servers = getServers();
        const connected = servers.filter(s => s.status === 'connected');

        return {
            version: CONFIG.VERSION,
            totalServers: servers.length,
            connectedServers: connected.length,
            totalChannels: _catalogMaster.length,
            channelsPerServer: connected.map(s => ({
                id: s.id,
                name: s.name,
                channels: s.channels.length,
                responseTime: s.responseTime
            })),
            ready: connected.length > 0
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const MultiServerFusionEngine = {
        // Server management
        addServer,
        removeServer,
        getServers,

        // Connection
        connectSingleServer,
        connectAllServersParallel,

        // Catalog
        mergeCatalogsWithDeduplic,
        getCatalog,
        searchChannels,

        // Fallback
        getBackupSources,
        getChannelWithFallback,

        // State access
        get catalogMaster() { return _catalogMaster; },
        get servers() { return _servers; },

        // Status
        getStatus,

        // Config
        CONFIG
    };

    // Global exports
    window.MULTI_SERVER_V9 = MultiServerFusionEngine;
    window.APE_MultiServer = MultiServerFusionEngine;  // Alias

    console.log('%c🌐 APE Multi-Server Fusion Engine v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
