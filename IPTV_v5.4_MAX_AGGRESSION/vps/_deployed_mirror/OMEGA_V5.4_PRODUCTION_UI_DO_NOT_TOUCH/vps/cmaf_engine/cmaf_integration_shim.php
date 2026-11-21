<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — CMAF Architecture Layer
 * Module: CMAF Integration Shim v2.0.0
 *
 * PURPOSE: Non-invasive bridge between resolve_quality.php and the CMAF engine.
 * Intercepts the channel resolution decision and, when CMAF is enabled for the
 * channel, routes the request through the CMAF pipeline instead of the legacy
 * TS/HLS direct-URL path.
 *
 * INTEGRATION (3 lines in resolve_quality.php):
 *   require_once __DIR__ . '/cmaf_engine/cmaf_integration_shim.php';
 *   // ... after $decision = mapDecision($ch, $map); ...
 *   $cmafResult = CmafIntegrationShim::intercept($ch, $decision ?? []);
 *   if ($cmafResult !== null) { echo $cmafResult; exit; }
 *
 * DELIVERY MODES:
 *   1. REDIRECT  → HTTP 302 to manifest URL (HLS or DASH)
 *   2. INLINE    → Serve manifest content directly (for players that can't follow redirects)
 *   3. PROXY     → Fetch and proxy the manifest (for CORS-restricted players)
 *
 * CODEC SELECTION (dynamic):
 *   Reads codec_priority from channel DNA → selects avc1/hvc1/av01 string
 *   LCEVC: does NOT change codec string, only adds X-LCEVC-* headers
 */

class CmafIntegrationShim
{
    const SHIM_VERSION = '2.0.0';

    // ─── Delivery modes ───────────────────────────────────────────────────────
    const MODE_REDIRECT = 'redirect';
    const MODE_INLINE   = 'inline';
    const MODE_PROXY    = 'proxy';

    // ─── CMAF engine base path (relative to resolve_quality.php) ─────────────
    const ENGINE_BASE = __DIR__ . '/cmaf_engine';

    // ─── Public base URL for CMAF streams (override via channel DNA) ──────────
    const DEFAULT_STREAMS_BASE_URL = 'https://iptv-ape.duckdns.org/streams';

    /**
     * Main interception point. Called from resolve_quality.php.
     *
     * @param string $channelId   Channel identifier.
     * @param array  $decision    mapDecision() result from resolve_quality.php.
     * @return string|null        Manifest content to echo, or null to fall through.
     */
    public static function intercept(string $channelId, array $decision): ?string
    {
        $shim = new self();
        return $shim->run($channelId, $decision);
    }

    private function run(string $channelId, array $decision): ?string
    {
        // ── Load channel DNA ──────────────────────────────────────────────────
        $dna = $this->loadChannelDna($channelId, $decision);

        // ── Check if CMAF is enabled for this channel ─────────────────────────
        if (empty($dna['cmaf_enabled'])) {
            return null; // Fall through to legacy resolve_quality.php path
        }

        // ── Load CMAF engine modules ──────────────────────────────────────────
        $this->requireEngineModules();

        // ── Detect player capabilities ────────────────────────────────────────
        $ua           = $_SERVER['HTTP_USER_AGENT'] ?? null;
        $formatParam  = $_GET['format'] ?? null;
        $playerCaps   = PlayerCapabilityResolver::resolve($ua, $formatParam, $dna);

        // ── If player can't handle fMP4 at all, fall through ──────────────────
        if (!$playerCaps['supports_fmp4'] && !$playerCaps['supports_dash']) {
            return null;
        }

        // ── Build CMAF manifest URLs ──────────────────────────────────────────
        $streamsBase = $dna['streams_base_url'] ?? self::DEFAULT_STREAMS_BASE_URL;
        $channelBase = rtrim($streamsBase, '/') . '/' . urlencode($channelId) . '/cmaf';

        $manifests = [
            'hls_fmp4'  => $channelBase . '/master.m3u8',
            'dash'      => $channelBase . '/stream.mpd',
            'hls_ts'    => $decision['url'] ?? null,   // Legacy TS URL as HLS fallback
            'ts_direct' => $decision['url'] ?? null,
        ];

        // Remove null entries
        $manifests = array_filter($manifests);

        // ── Select best manifest URL ──────────────────────────────────────────
        $manifestUrl = PlayerCapabilityResolver::selectManifestUrl($playerCaps, $manifests);

        if (empty($manifestUrl)) {
            return null; // No valid manifest, fall through
        }

        // ── Determine delivery mode ───────────────────────────────────────────
        $deliveryMode = $dna['cmaf_delivery_mode'] ?? self::MODE_INLINE;

        // ── Emit LCEVC headers if enabled ─────────────────────────────────────
        $this->emitLcevcHeaders($dna, $playerCaps);

        // ── Emit CMAF identification headers ─────────────────────────────────
        $this->emitCmafHeaders($dna, $playerCaps, $manifestUrl);

        // ── Deliver manifest ──────────────────────────────────────────────────
        return $this->deliverManifest($manifestUrl, $deliveryMode, $playerCaps, $dna);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MANIFEST DELIVERY
    // ═══════════════════════════════════════════════════════════════════════════

    private function deliverManifest(
        string $manifestUrl,
        string $mode,
        array  $playerCaps,
        array  $dna
    ): string {
        switch ($mode) {
            case self::MODE_REDIRECT:
                header('Location: ' . $manifestUrl, true, 302);
                return '';

            case self::MODE_PROXY:
                return $this->proxyManifest($manifestUrl, $playerCaps, $dna);

            case self::MODE_INLINE:
            default:
                return $this->serveManifestInline($manifestUrl, $playerCaps, $dna);
        }
    }

    /**
     * Serve manifest inline: fetch from origin and return content.
     * For live streams where the manifest must be served fresh on each request.
     */
    private function serveManifestInline(string $manifestUrl, array $playerCaps, array $dna): string
    {
        // Check if manifest exists locally (packaged CMAF)
        $localPath = $this->resolveLocalManifestPath($manifestUrl, $dna);

        if ($localPath && file_exists($localPath)) {
            $content = file_get_contents($localPath);
            $contentType = str_ends_with($localPath, '.mpd') ? 'application/dash+xml' : 'application/vnd.apple.mpegurl';
            header('Content-Type: ' . $contentType);
            return $content;
        }

        // Manifest not yet packaged — serve a repair/proxy of the origin stream
        // as HLS with the LCEVC signal headers already emitted
        $originUrl = $dna['origin_url'] ?? $dna['url'] ?? null;

        if ($originUrl) {
            return $this->buildRepairManifest($originUrl, $playerCaps, $dna);
        }

        // Last resort: redirect
        header('Location: ' . $manifestUrl, true, 302);
        return '';
    }

    /**
     * Proxy manifest: fetch from origin, rewrite URLs, return content.
     */
    private function proxyManifest(string $manifestUrl, array $playerCaps, array $dna): string
    {
        $ctx = stream_context_create([
            'http' => [
                'timeout'       => 5,
                'user_agent'    => 'IPTV-Navigator-PRO-CMAF-Shim/' . self::SHIM_VERSION,
                'ignore_errors' => true,
            ],
        ]);

        $content = @file_get_contents($manifestUrl, false, $ctx);

        if ($content === false) {
            // Proxy failed — fall back to redirect
            header('Location: ' . $manifestUrl, true, 302);
            return '';
        }

        $contentType = str_contains($manifestUrl, '.mpd') ? 'application/dash+xml' : 'application/vnd.apple.mpegurl';
        header('Content-Type: ' . $contentType);
        return $content;
    }

    /**
     * Build a repair HLS manifest for an origin stream that hasn't been packaged yet.
     * This is the SIGNAL_ONLY state: we serve HLS pointing to origin + LCEVC signal.
     */
    private function buildRepairManifest(string $originUrl, array $playerCaps, array $dna): string
    {
        header('Content-Type: application/vnd.apple.mpegurl');

        $lcevcEnabled = !empty($dna['lcevc_enabled']);
        $lcevcState   = 'SIGNAL_ONLY'; // Not yet packaged
        $codec        = $this->resolveCodecString($dna, $playerCaps);

        $lines = [
            '#EXTM3U',
            '#EXT-X-VERSION:3',
        ];

        if ($lcevcEnabled) {
            $lines[] = '#EXT-X-APE-LCEVC:ENABLED';
            $lines[] = '#EXT-X-APE-LCEVC-STATE:' . $lcevcState;
            $lines[] = '#EXT-X-APE-LCEVC-MODE:' . strtoupper($dna['lcevc_mode'] ?? 'SEI_METADATA');
        }

        // Bandwidth from DNA or default
        $bandwidth = ($dna['bandwidth'] ?? 5000) * 1000;

        $lines[] = '#EXT-X-STREAM-INF:'
            . 'BANDWIDTH=' . $bandwidth . ','
            . 'CODECS="' . $codec . '"';
        $lines[] = $originUrl;

        return implode("\n", $lines) . "\n";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEADER EMISSION
    // ═══════════════════════════════════════════════════════════════════════════

    private function emitLcevcHeaders(array $dna, array $playerCaps): void
    {
        if (empty($dna['lcevc_enabled'])) return;

        $lcevcState = $dna['lcevc_state'] ?? 'SIGNAL_ONLY';

        header('X-LCEVC-Enabled: 1');
        header('X-LCEVC-State: ' . $lcevcState);
        header('X-LCEVC-Base-Codec: ' . strtoupper($dna['lcevc_base_codec'] ?? 'H264'));
        header('X-LCEVC-Transport: ' . strtoupper($dna['lcevc_transport'] ?? 'EMBEDDED'));
        header('X-LCEVC-Player-Support: ' . ($playerCaps['supports_lcevc'] ? '1' : '0'));
        header('X-LCEVC-Player-Id: ' . ($playerCaps['player_id'] ?? 'Unknown'));
    }

    private function emitCmafHeaders(array $dna, array $playerCaps, string $manifestUrl): void
    {
        header('X-CMAF-Engine: APE-CMAF/' . self::SHIM_VERSION);
        header('X-CMAF-Format: ' . ($playerCaps['preferred_format'] ?? 'hls_fmp4'));
        header('X-CMAF-Codec: ' . $this->resolveCodecString($dna, $playerCaps));
        header('X-CMAF-Player: ' . ($playerCaps['player_id'] ?? 'Unknown'));
        header('X-CMAF-Manifest: ' . $manifestUrl);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CODEC RESOLUTION (DYNAMIC)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Resolves the codec string dynamically based on channel DNA and player capabilities.
     * LCEVC does NOT change the base codec string — it is signaled via headers/tags.
     */
    private function resolveCodecString(array $dna, array $playerCaps): string
    {
        $codecPriority = $dna['codec_priority'] ?? ['h264'];

        foreach ($codecPriority as $codec) {
            switch (strtolower($codec)) {
                case 'hevc':
                case 'h265':
                    if ($playerCaps['supports_hevc']) {
                        return 'hvc1.1.6.L120.90,mp4a.40.2';
                    }
                    break;
                case 'av1':
                    // AV1 support is rare in IPTV players — only use if explicitly requested
                    if (($playerCaps['player_id'] ?? '') === 'Chrome') {
                        return 'av01.0.08M.08,mp4a.40.2';
                    }
                    break;
                case 'h264':
                case 'avc':
                default:
                    return 'avc1.640028,mp4a.40.2';
            }
        }

        // Default fallback
        return 'avc1.640028,mp4a.40.2';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    private function loadChannelDna(string $channelId, array $decision): array
    {
        // Merge decision data with any CMAF-specific DNA
        $dna = $decision;
        $dna['channel_id'] = $channelId;

        // Try to load from channels_map.json if not already loaded
        if (empty($dna['cmaf_enabled']) && empty($dna['lcevc_enabled'])) {
            $mapPath = __DIR__ . '/../channels_map.json';
            if (file_exists($mapPath)) {
                $map = json_decode(file_get_contents($mapPath), true);
                if (isset($map[$channelId])) {
                    $dna = array_merge($dna, $map[$channelId]);
                }
            }
        }

        return $dna;
    }

    private function requireEngineModules(): void
    {
        $modules = [
            self::ENGINE_BASE . '/modules/player_capability_resolver.php',
            self::ENGINE_BASE . '/modules/dual_manifest_generator.php',
            self::ENGINE_BASE . '/modules/cmaf_packaging_engine.php',
            self::ENGINE_BASE . '/modules/lcevc_state_engine.php',
        ];

        foreach ($modules as $module) {
            if (file_exists($module)) {
                require_once $module;
            }
        }
    }

    private function resolveLocalManifestPath(string $manifestUrl, array $dna): ?string
    {
        $channelId = $dna['channel_id'] ?? '';
        if (empty($channelId)) return null;

        $localBase = '/var/www/html/streams/' . $channelId . '/cmaf';

        if (str_ends_with($manifestUrl, '.mpd')) {
            return $localBase . '/stream.mpd';
        }
        if (str_ends_with($manifestUrl, '.m3u8')) {
            return $localBase . '/master.m3u8';
        }

        return null;
    }
}
