<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IPTV Navigator PRO — CMAF Architecture Layer                              ║
 * ║  Module: CMAF Orchestrator (CO) v2.0.0                                     ║
 * ║                                                                            ║
 * ║  PIPELINE FLOW (REAL EXECUTION):                                           ║
 * ║  1. PlayerCapabilityResolver  → Detect player, format, LCEVC support       ║
 * ║  2. ManifestForensicsEngine   → Analyze source manifest health             ║
 * ║  3. ManifestRepairEngine      → Repair if health < 90                      ║
 * ║  4. CmafPackagingEngine       → Execute FFmpeg, produce fMP4 segments      ║
 * ║  5. DualManifestGenerator     → Generate HLS + DASH with LCEVC signaling   ║
 * ║  6. CdnRoutingEngine          → Select best CDN node for delivery          ║
 * ║  7. Serve optimal manifest URL to player                                   ║
 * ║                                                                            ║
 * ║  LCEVC STATES: OFF | SIGNAL_ONLY | PACKAGED | PLAYER_VALIDATED             ║
 * ║  BACKWARD COMPATIBILITY: 100% — all existing APE routes preserved          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

require_once __DIR__ . '/modules/manifest_forensics.php';
require_once __DIR__ . '/modules/manifest_repair_engine.php';
require_once __DIR__ . '/modules/cmaf_packaging_engine.php';
require_once __DIR__ . '/modules/dual_manifest_generator.php';
require_once __DIR__ . '/modules/player_capability_resolver.php';
require_once __DIR__ . '/modules/cdn_routing_engine.php';
require_once __DIR__ . '/modules/lcevc_state_engine.php';
require_once __DIR__ . '/modules/lcevc_player_detector.php';
require_once __DIR__ . '/modules/lcevc_media_validator.php';

class CmafOrchestrator
{
    const ORCHESTRATOR_VERSION = '2.0.0';

    // ─── Pipeline Decision Thresholds ─────────────────────────────────────────
    const HEALTH_REPAIR_THRESHOLD  = 90;
    const CMAF_ELIGIBLE_THRESHOLD  = 41;
    const CMAF_NATIVE_THRESHOLD    = 61;

    // ─── Cache TTLs ───────────────────────────────────────────────────────────
    const ANALYSIS_CACHE_TTL = 300;
    const ROUTING_CACHE_TTL  = 10;

    // ─── Public Streams Base URL (configurable via channel DNA) ──────────────
    const DEFAULT_CDN_BASE = 'https://iptv-ape.duckdns.org';

    // ─── Inline Manifest Serve Path ───────────────────────────────────────────
    // Repaired manifests are written here and served via a public URL.
    const INLINE_SERVE_DIR  = '/var/www/html/ape_inline';
    const INLINE_SERVE_URL  = '/ape_inline';

    /**
     * PRIMARY ENTRY POINT: Resolve the best manifest URL for a player request.
     */
    public static function resolveForPlayer(
        string $channelId,
        array  $channelDna,
        array  $request = []
    ): array {
        $orchestrator = new self();
        return $orchestrator->runOrchestrationPipeline($channelId, $channelDna, $request);
    }

    private function runOrchestrationPipeline(string $channelId, array $dna, array $request): array
    {
        $startTime   = microtime(true);
        $pipelineLog = [];

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 1: Player Capability Resolution (including LCEVC detection)
        // ═══════════════════════════════════════════════════════════════════════
        $userAgent   = $request['user_agent']   ?? $_SERVER['HTTP_USER_AGENT'] ?? null;
        $formatParam = $request['format_param'] ?? $_GET['format'] ?? null;

        $playerCapability = PlayerCapabilityResolver::resolve($userAgent, $formatParam, $dna);
        $pipelineLog['player_resolution'] = $playerCapability;

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 2: LCEVC State Resolution
        // ═══════════════════════════════════════════════════════════════════════
        $lcevcState = $this->resolveLcevcState($dna, $playerCapability, $pipelineLog);
        $pipelineLog['lcevc_state'] = $lcevcState;

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 3: Determine Source URL
        // ═══════════════════════════════════════════════════════════════════════
        $sourceUrl = $this->resolveSourceUrl($dna, $playerCapability);

        if (empty($sourceUrl)) {
            return $this->buildErrorResult('No source URL available for channel: ' . $channelId, $pipelineLog);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 4: Cache Hit Check
        // ═══════════════════════════════════════════════════════════════════════
        $existingManifests = $this->checkExistingManifests($channelId, $dna);

        if (!empty($existingManifests) && $this->manifestsAreFresh($channelId)) {
            $pipelineLog['cache_hit'] = true;
            $manifestUrl = PlayerCapabilityResolver::selectManifestUrl($playerCapability, $existingManifests);
            return $this->buildSuccessResult($manifestUrl, $playerCapability, $pipelineLog, $startTime, 'cache_hit', $lcevcState);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 5: Fetch and Analyze Source Manifest
        // ═══════════════════════════════════════════════════════════════════════
        $manifestContent = $this->fetchManifest($sourceUrl);

        if ($manifestContent === null) {
            $pipelineLog['fallback'] = 'manifest_fetch_failed';
            return $this->buildSuccessResult($sourceUrl, $playerCapability, $pipelineLog, $startTime, 'direct_fallback', $lcevcState);
        }

        $analysisReport = ManifestForensicsEngine::analyze($manifestContent, $channelId);
        $pipelineLog['forensics'] = [
            'health_score'   => $analysisReport['scores']['manifest_health_score'],
            'cmaf_score'     => $analysisReport['scores']['cmaf_readiness_score'],
            'classification' => $analysisReport['classification'],
        ];

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 6: Repair Manifest if Degraded
        // ═══════════════════════════════════════════════════════════════════════
        $workingContent = $manifestContent;
        $healthScore    = $analysisReport['scores']['manifest_health_score'];

        if ($healthScore < self::HEALTH_REPAIR_THRESHOLD) {
            $repairProfile = $this->selectRepairProfile($playerCapability, $analysisReport);
            $repairResult  = ManifestRepairEngine::repair($manifestContent, $analysisReport, $repairProfile);

            if ($repairResult['status'] === 'repaired' && $repairResult['repaired_manifest'] !== null) {
                $workingContent = $repairResult['repaired_manifest'];
                $pipelineLog['repair'] = [
                    'confidence' => $repairResult['repair_confidence'],
                    'actions'    => count($repairResult['repair_log']),
                    'profile'    => $repairProfile,
                ];
            } elseif ($repairResult['status'] === 'quarantined') {
                $pipelineLog['quarantine'] = true;
                return $this->buildSuccessResult($sourceUrl, $playerCapability, $pipelineLog, $startTime, 'quarantine_fallback', $lcevcState);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 7: Determine Delivery Strategy
        // ═══════════════════════════════════════════════════════════════════════
        $cmafScore     = $analysisReport['scores']['cmaf_readiness_score'];
        $segmentFormat = $analysisReport['classification']['segment_format'];
        $migrationRec  = $analysisReport['classification']['migration_recommendation'];

        $deliveryStrategy = $this->determineDeliveryStrategy(
            $cmafScore, $segmentFormat, $migrationRec, $playerCapability, $dna
        );
        $pipelineLog['delivery_strategy'] = $deliveryStrategy;

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 8: Execute Delivery Strategy (REAL EXECUTION)
        // ═══════════════════════════════════════════════════════════════════════
        $manifestUrl = match($deliveryStrategy) {
            'serve_cmaf_native'      => $this->serveCmafNative($channelId, $dna, $playerCapability, $pipelineLog),
            'package_and_serve'      => $this->packageAndServe($channelId, $sourceUrl, $dna, $playerCapability, $lcevcState, $pipelineLog),
            'package_lcevc_and_serve'=> $this->packageAndServe($channelId, $sourceUrl, $dna, $playerCapability, $lcevcState, $pipelineLog),
            'serve_hls_repaired'     => $this->serveHlsRepaired($channelId, $workingContent, $dna, $playerCapability, $lcevcState, $pipelineLog),
            'serve_ts_direct'        => $sourceUrl,
            default                  => $sourceUrl,
        };

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 9: CDN Routing
        // ═══════════════════════════════════════════════════════════════════════
        $cdnNodes  = $dna['cdn_nodes'] ?? CdnRoutingEngine::DEFAULT_CDN_NODES;
        $cdnResult = CdnRoutingEngine::selectNode($cdnNodes, CdnRoutingEngine::STRATEGY_PRIMARY_FAILOVER, $channelId);
        $pipelineLog['cdn_routing'] = [
            'selected_node' => $cdnResult['selected_node']['id'],
            'health'        => $cdnResult['health_data']['status'] ?? 'unknown',
        ];

        // Apply CDN base URL only if manifest is a relative path (not inline or absolute)
        if (!str_starts_with($manifestUrl, 'http') && !str_starts_with($manifestUrl, '/')) {
            $cdnBase     = $dna['cdn_base_url'] ?? self::DEFAULT_CDN_BASE;
            $manifestUrl = rtrim($cdnBase, '/') . '/' . ltrim($manifestUrl, '/');
        }

        return $this->buildSuccessResult($manifestUrl, $playerCapability, $pipelineLog, $startTime, $deliveryStrategy, $lcevcState);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LCEVC STATE RESOLVER
    // ═══════════════════════════════════════════════════════════════════════════

    private function resolveLcevcState(array $dna, array $playerCapability, array &$log): string
    {
        if (empty($dna['lcevc_enabled'])) {
            return LcevcStateEngine::STATE_OFF;
        }

        $playerName = $playerCapability['player_id'] ?? 'Unknown';
        $state      = LcevcStateEngine::resolveState($dna, $playerName);
        $log['lcevc_player'] = $playerName;
        $log['lcevc_media_validated'] = !empty($dna['lcevc_media_validated']);

        return $state;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DELIVERY STRATEGY DETERMINATION
    // ═══════════════════════════════════════════════════════════════════════════

    private function determineDeliveryStrategy(
        int    $cmafScore,
        string $segmentFormat,
        string $migrationRec,
        array  $playerCapability,
        array  $dna
    ): string {
        // Player doesn't support fMP4 — always serve TS
        if (!$playerCapability['supports_fmp4']) {
            return 'serve_ts_direct';
        }

        // LCEVC packaging requested and player supports it
        if (!empty($dna['lcevc_enabled']) && !empty($playerCapability['supports_lcevc'])) {
            if ($cmafScore >= self::CMAF_ELIGIBLE_THRESHOLD) {
                return 'package_lcevc_and_serve';
            }
        }

        // Already CMAF-native — serve directly
        if ($segmentFormat === 'fmp4' && $cmafScore >= self::CMAF_NATIVE_THRESHOLD) {
            return 'serve_cmaf_native';
        }

        // CMAF-eligible — package and serve
        if ($cmafScore >= self::CMAF_ELIGIBLE_THRESHOLD && $migrationRec === 'remux_to_cmaf') {
            return 'package_and_serve';
        }

        // HLS-only — serve repaired HLS
        if ($segmentFormat === 'ts' || $migrationRec === 'normalize_hls_only') {
            return 'serve_hls_repaired';
        }

        return 'serve_ts_direct';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DELIVERY STRATEGY EXECUTORS
    // ═══════════════════════════════════════════════════════════════════════════

    private function serveCmafNative(string $channelId, array $dna, array $playerCapability, array &$log): string
    {
        $manifests = $this->checkExistingManifests($channelId, $dna);
        $url = PlayerCapabilityResolver::selectManifestUrl($playerCapability, $manifests);
        $log['cmaf_native_served'] = true;
        return $url ?: ($dna['url'] ?? $dna['stream_url'] ?? '');
    }

    /**
     * REAL PACKAGING EXECUTION: Invokes CmafPackagingEngine::package() which
     * executes FFmpeg, produces fMP4 segments, and writes manifests to disk.
     * Then calls DualManifestGenerator to produce HLS + DASH with LCEVC signaling.
     */
    private function packageAndServe(
        string $channelId,
        string $sourceUrl,
        array  $dna,
        array  $playerCapability,
        string $lcevcState,
        array  &$log
    ): string {
        // ── Step 1: Execute CMAF packaging (real FFmpeg execution) ────────────
        $packagingProfile = $this->selectPackagingProfile($dna);
        $packagingResult  = CmafPackagingEngine::package($sourceUrl, $channelId, $packagingProfile, $dna);

        $log['packaging'] = [
            'status'  => $packagingResult['status'],
            'profile' => $packagingProfile,
            'codec'   => $dna['codec_priority'][0] ?? 'h264',
            'lcevc'   => $lcevcState !== LcevcStateEngine::STATE_OFF,
        ];

        if ($packagingResult['status'] === 'error') {
            // Packaging failed — fall back to source URL
            $log['packaging_fallback'] = $packagingResult['message'] ?? 'unknown error';
            return $sourceUrl;
        }

        // ── Step 2: Generate dual manifests (HLS + DASH) with LCEVC signaling ─
        $outputPath = CmafPackagingEngine::STREAMS_BASE_PATH . '/' . $channelId . '/cmaf';
        $cdnBase    = $dna['cdn_base_url'] ?? self::DEFAULT_CDN_BASE;
        $baseUrl    = rtrim($cdnBase, '/') . '/streams/' . $channelId . '/cmaf';

        $manifestMeta = $packagingResult['data']['segment_metadata'] ?? [];
        $manifestMeta['lcevc_state']  = $lcevcState;
        $manifestMeta['lcevc_config'] = $dna;

        $manifestResult = DualManifestGenerator::generate($outputPath, $manifestMeta, $dna, $baseUrl);

        $log['manifest_generation'] = [
            'status' => $manifestResult['status'],
            'hls'    => !empty($manifestResult['hls_path']),
            'dash'   => !empty($manifestResult['dash_path']),
            'lcevc'  => $lcevcState !== LcevcStateEngine::STATE_OFF,
        ];

        if ($manifestResult['status'] === 'error') {
            $log['manifest_fallback'] = $manifestResult['message'] ?? 'unknown error';
            return $sourceUrl;
        }

        // ── Step 3: Select manifest URL based on player capability ────────────
        $manifests = [
            'hls'      => $baseUrl . '/master.m3u8',
            'hls_fmp4' => $baseUrl . '/master.m3u8',
            'dash'     => $baseUrl . '/stream.mpd',
        ];

        return PlayerCapabilityResolver::selectManifestUrl($playerCapability, $manifests);
    }

    /**
     * REAL INLINE REPAIR: Writes the repaired manifest to a public directory
     * and returns a real HTTP URL (not `inline:channelId`).
     */
    private function serveHlsRepaired(
        string $channelId,
        string $content,
        array  $dna,
        array  $playerCapability,
        string $lcevcState,
        array  &$log
    ): string {
        // ── Inject LCEVC signaling into repaired manifest if applicable ────────
        if ($lcevcState !== LcevcStateEngine::STATE_OFF && !empty($dna['lcevc_enabled'])) {
            $content = $this->injectLcevcTagsIntoManifest($content, $dna, $lcevcState);
            $log['lcevc_injected_into_repair'] = true;
        }

        // ── Ensure the inline serve directory exists ───────────────────────────
        $serveDir = self::INLINE_SERVE_DIR;
        if (!is_dir($serveDir)) {
            @mkdir($serveDir, 0755, true);
        }

        // ── Write repaired manifest to public path ─────────────────────────────
        $filename    = 'ape_repair_' . preg_replace('/[^a-z0-9_-]/i', '_', $channelId) . '.m3u8';
        $servePath   = $serveDir . '/' . $filename;
        $bytesWritten = file_put_contents($servePath, $content);

        if ($bytesWritten === false) {
            // Write failed — fall back to source URL
            $log['inline_repair_failed'] = 'file_write_error';
            return $dna['url'] ?? $dna['stream_url'] ?? '';
        }

        $cdnBase   = $dna['cdn_base_url'] ?? self::DEFAULT_CDN_BASE;
        $serveUrl  = rtrim($cdnBase, '/') . self::INLINE_SERVE_URL . '/' . $filename;

        $log['hls_repaired']        = true;
        $log['repaired_manifest_url'] = $serveUrl;
        $log['repaired_bytes']      = $bytesWritten;

        return $serveUrl;
    }

    /**
     * Injects APE LCEVC tags into an existing HLS manifest.
     * Tags are inserted after #EXTM3U header line.
     */
    private function injectLcevcTagsIntoManifest(string $content, array $dna, string $lcevcState): string
    {
        $mode      = strtoupper($dna['lcevc_mode']            ?? 'SEI_METADATA');
        $codec     = strtoupper($dna['lcevc_base_codec']      ?? 'H264');
        $transport = strtoupper($dna['lcevc_transport']       ?? 'EMBEDDED');
        $fallback  = strtoupper($dna['lcevc_fallback']        ?? 'BASE_ONLY');
        $required  = !empty($dna['lcevc_player_required']) ? '1' : '0';

        $lcevcBlock = implode("\n", [
            '#EXT-X-APE-LCEVC:ENABLED',
            '#EXT-X-APE-LCEVC-STATE:' . $lcevcState,
            '#EXT-X-APE-LCEVC-MODE:' . $mode,
            '#EXT-X-APE-LCEVC-BASE-CODEC:' . $codec,
            '#EXT-X-APE-LCEVC-TRANSPORT:' . $transport,
            '#EXT-X-APE-LCEVC-FALLBACK:' . $fallback,
            '#EXT-X-APE-LCEVC-PLAYER-REQUIRED:' . $required,
        ]);

        // Insert after #EXTM3U line
        if (str_starts_with(ltrim($content), '#EXTM3U')) {
            $lines    = explode("\n", $content);
            $firstLine = array_shift($lines);
            return $firstLine . "\n" . $lcevcBlock . "\n" . implode("\n", $lines);
        }

        // Prepend if no #EXTM3U found
        return "#EXTM3U\n" . $lcevcBlock . "\n" . $content;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    private function selectPackagingProfile(array $dna): string
    {
        $isLive = $dna['is_live'] ?? true;
        $llhls  = $dna['low_latency'] ?? false;

        if ($llhls) return CmafPackagingEngine::PROFILE_LOW_LATENCY;
        if ($isLive) return CmafPackagingEngine::PROFILE_LIVE;
        return CmafPackagingEngine::PROFILE_VOD;
    }

    private function resolveSourceUrl(array $dna, array $playerCapability): string
    {
        if (!empty($dna['url_cmaf']) && $playerCapability['supports_fmp4']) {
            return $dna['url_cmaf'];
        }
        if (!empty($dna['url_hls'])) {
            return $dna['url_hls'];
        }
        if (!empty($dna['url_ts'])) {
            return $dna['url_ts'];
        }
        return $dna['url'] ?? $dna['stream_url'] ?? '';
    }

    private function checkExistingManifests(string $channelId, array $dna): array
    {
        $basePath = CmafPackagingEngine::STREAMS_BASE_PATH . '/' . $channelId . '/cmaf';
        $cdnBase  = $dna['cdn_base_url'] ?? self::DEFAULT_CDN_BASE;
        $baseUrl  = rtrim($cdnBase, '/') . '/streams/' . $channelId . '/cmaf';

        $manifests = [];

        if (file_exists($basePath . '/master.m3u8')) {
            $manifests['hls']      = $baseUrl . '/master.m3u8';
            $manifests['hls_fmp4'] = $baseUrl . '/master.m3u8';
        }

        if (file_exists($basePath . '/stream.mpd')) {
            $manifests['dash'] = $baseUrl . '/stream.mpd';
        }

        return $manifests;
    }

    private function manifestsAreFresh(string $channelId): bool
    {
        $mpdPath = CmafPackagingEngine::STREAMS_BASE_PATH . '/' . $channelId . '/cmaf/stream.mpd';
        if (!file_exists($mpdPath)) return false;
        return (time() - filemtime($mpdPath)) < self::ANALYSIS_CACHE_TTL;
    }

    private function fetchManifest(string $url): ?string
    {
        $context = stream_context_create([
            'http' => [
                'timeout'       => 5,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer'      => false,
                'verify_peer_name' => false,
            ],
        ]);

        $content = @file_get_contents($url, false, $context);
        return ($content !== false && strlen($content) > 10) ? $content : null;
    }

    private function selectRepairProfile(array $playerCapability, array $analysisReport): string
    {
        if (!$playerCapability['supports_fmp4']) {
            return ManifestRepairEngine::PROFILE_COMPATIBILITY_FIRST;
        }

        $cmafScore = $analysisReport['scores']['cmaf_readiness_score'];
        if ($cmafScore >= self::CMAF_ELIGIBLE_THRESHOLD) {
            return ManifestRepairEngine::PROFILE_CMAF_PREFERRED;
        }

        return ManifestRepairEngine::PROFILE_PERFORMANCE_BALANCED;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESULT BUILDERS
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildSuccessResult(
        string $manifestUrl,
        array  $playerCapability,
        array  $pipelineLog,
        float  $startTime,
        string $strategy,
        string $lcevcState = LcevcStateEngine::STATE_OFF
    ): array {
        return [
            'status'          => 'success',
            'manifest_url'    => $manifestUrl,
            'player_id'       => $playerCapability['player_id'] ?? 'unknown',
            'format_served'   => $playerCapability['preferred_format'],
            'strategy'        => $strategy,
            'lcevc_state'     => $lcevcState,
            'pipeline_log'    => $pipelineLog,
            'processing_ms'   => (int)((microtime(true) - $startTime) * 1000),
            'engine_version'  => self::ORCHESTRATOR_VERSION,
        ];
    }

    private function buildErrorResult(string $message, array $pipelineLog): array
    {
        return [
            'status'       => 'error',
            'message'      => $message,
            'pipeline_log' => $pipelineLog,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC HELPER: Quick integration with resolve_quality.php
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Lightweight integration for resolve_quality.php.
     * Returns just the manifest URL string for backward compatibility.
     *
     * Usage in resolve_quality.php:
     *   require_once 'cmaf_engine/cmaf_orchestrator.php';
     *   $url = CmafOrchestrator::getManifestUrl($channelId, $channelDna);
     *   if ($url) { header('Location: ' . $url); exit; }
     */
    public static function getManifestUrl(string $channelId, array $channelDna, array $request = []): ?string
    {
        $result = self::resolveForPlayer($channelId, $channelDna, $request);
        if ($result['status'] === 'success') {
            return $result['manifest_url'];
        }
        return null;
    }
}
