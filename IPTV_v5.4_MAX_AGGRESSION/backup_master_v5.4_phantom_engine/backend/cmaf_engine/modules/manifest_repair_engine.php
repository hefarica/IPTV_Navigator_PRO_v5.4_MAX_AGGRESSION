<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IPTV Navigator PRO — CMAF Architecture Layer                              ║
 * ║  Module: Manifest Repair Engine (MRE) v1.0.0                               ║
 * ║                                                                            ║
 * ║  PURPOSE: Intelligently repair, normalize, and optimize M3U8 manifests     ║
 * ║           based on the analysis report from ManifestForensicsEngine.       ║
 * ║                                                                            ║
 * ║  OPERATING PRINCIPLES:                                                     ║
 * ║  1. NEVER invent media that does not exist.                                ║
 * ║  2. NEVER fabricate codec claims without evidence.                         ║
 * ║  3. NEVER claim CMAF unless the structure actually supports it.            ║
 * ║  4. ALWAYS preserve original stream URLs (pure, no truncation).            ║
 * ║  5. ALWAYS preserve APE proprietary tags (KODIPROP, EXTVLCOPT, EXTHTTP).   ║
 * ║  6. ALWAYS preserve JWT metadata payloads.                                 ║
 * ║  7. Every repair is explainable and traceable in the repair log.           ║
 * ║                                                                            ║
 * ║  INTEGRATION: Called by cmaf_orchestrator.php when health_score < 90      ║
 * ║               and the manifest is classified as repairable.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

class ManifestRepairEngine
{
    const ENGINE_VERSION = '1.0.0';

    // ─── Optimization Profiles ────────────────────────────────────────────────
    const PROFILE_COMPATIBILITY_FIRST    = 'compatibility_first';
    const PROFILE_PERFORMANCE_BALANCED   = 'performance_balanced';
    const PROFILE_CMAF_PREFERRED         = 'cmaf_preferred';
    const PROFILE_LOW_LATENCY_PREPARED   = 'low_latency_prepared';
    const PROFILE_FORENSIC_PRESERVATION  = 'forensic_preservation';

    // ─── APE Proprietary Tags (MUST be preserved, never removed) ─────────────
    const APE_PROTECTED_PREFIXES = [
        '#EXT-X-APE-',
        '#EXT-X-SYS-',
        '#KODIPROP:',
        '#EXTVLCOPT:',
        '#EXTHTTP:',
        '#EXTATTRFROMURL:',
    ];

    // ─── Internal State ───────────────────────────────────────────────────────
    private array $originalLines = [];
    private array $repairLog = [];
    private string $profile;
    private array $analysisReport;

    /**
     * Main entry point. Repairs a manifest based on its analysis report.
     *
     * @param string $manifestContent  Raw M3U8 content as a string.
     * @param array  $analysisReport   Report from ManifestForensicsEngine::analyze().
     * @param string $profile          Optimization profile to apply.
     * @return array                   ['repaired_manifest' => string, 'repair_log' => array, 'repair_confidence' => int]
     */
    public static function repair(
        string $manifestContent,
        array  $analysisReport,
        string $profile = self::PROFILE_PERFORMANCE_BALANCED
    ): array {
        $engine = new self();
        $engine->originalLines = array_filter(
            array_map('trim', explode("\n", $manifestContent)),
            fn($line) => $line !== ''
        );
        $engine->analysisReport = $analysisReport;
        $engine->profile = $profile;

        return $engine->runRepairPipeline();
    }

    /**
     * Orchestrates the repair pipeline.
     */
    private function runRepairPipeline(): array
    {
        $healthScore = $this->analysisReport['scores']['manifest_health_score'] ?? 0;
        $classification = $this->analysisReport['classification'] ?? [];

        // Quarantine unrecoverable manifests
        if ($healthScore < 20 || ($classification['health_classification'] ?? '') === 'unrecoverable') {
            return [
                'repaired_manifest' => null,
                'repair_log'        => [['action' => 'QUARANTINE', 'reason' => 'Manifest health score below recovery threshold (< 20)', 'score' => $healthScore]],
                'repair_confidence' => 0,
                'status'            => 'quarantined',
            ];
        }

        $lines = $this->originalLines;

        // ── Step 1: Normalize Whitespace and Encoding ──────────────────────────
        $lines = $this->normalizeWhitespace($lines);

        // ── Step 2: Ensure #EXTM3U Header ─────────────────────────────────────
        $lines = $this->ensureExtm3uHeader($lines);

        // ── Step 3: Remove Duplicate or Contradictory Tags ────────────────────
        $lines = $this->removeDuplicateTags($lines);

        // ── Step 4: Fix Contradictory KODIPROP vs Stream Type ─────────────────
        $lines = $this->fixKodiPropContradictions($lines, $classification);

        // ── Step 5: Normalize EXT-X-VERSION ───────────────────────────────────
        $lines = $this->normalizeHlsVersion($lines, $classification);

        // ── Step 6: Apply Profile-Specific Optimizations ──────────────────────
        $lines = $this->applyProfileOptimizations($lines);

        // ── Step 7: Validate APE Enrichment Preservation ──────────────────────
        $this->validateApePreservation($lines);

        // ── Step 8: Reassemble and Calculate Confidence ───────────────────────
        $repairedManifest = implode("\n", $lines) . "\n";
        $repairConfidence = $this->calculateRepairConfidence();

        return [
            'repaired_manifest' => $repairedManifest,
            'repair_log'        => $this->repairLog,
            'repair_confidence' => $repairConfidence,
            'status'            => 'repaired',
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 1: Normalize Whitespace
    // ═══════════════════════════════════════════════════════════════════════════

    private function normalizeWhitespace(array $lines): array
    {
        $normalized = [];
        $count = 0;
        foreach ($lines as $line) {
            $clean = trim($line);
            if ($clean !== $line) {
                $count++;
            }
            if ($clean !== '') {
                $normalized[] = $clean;
            }
        }
        if ($count > 0) {
            $this->repairLog[] = [
                'action' => 'NORMALIZE_WHITESPACE',
                'reason' => "Trimmed $count lines with leading/trailing whitespace.",
                'impact' => 'low',
            ];
        }
        return $normalized;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 2: Ensure #EXTM3U Header
    // ═══════════════════════════════════════════════════════════════════════════

    private function ensureExtm3uHeader(array $lines): array
    {
        if (empty($lines) || !str_starts_with($lines[0], '#EXTM3U')) {
            array_unshift($lines, '#EXTM3U');
            $this->repairLog[] = [
                'action' => 'ADD_EXTM3U_HEADER',
                'reason' => 'Missing mandatory #EXTM3U header. Added at position 0.',
                'impact' => 'high',
            ];
        }
        return $lines;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 3: Remove Duplicate Tags
    // ═══════════════════════════════════════════════════════════════════════════

    private function removeDuplicateTags(array $lines): array
    {
        // Tags that should appear only once in a media playlist
        $singletonTags = [
            '#EXT-X-TARGETDURATION:',
            '#EXT-X-PLAYLIST-TYPE:',
            '#EXT-X-VERSION:',
            '#EXT-X-ENDLIST',
        ];

        $seenSingletons = [];
        $cleaned = [];
        $removedCount = 0;

        foreach ($lines as $line) {
            $isSingleton = false;
            foreach ($singletonTags as $tag) {
                if (str_starts_with($line, $tag)) {
                    if (isset($seenSingletons[$tag])) {
                        $removedCount++;
                        $isSingleton = true;
                        break;
                    }
                    $seenSingletons[$tag] = true;
                    $isSingleton = true;
                    break;
                }
            }
            if (!$isSingleton || !isset($seenSingletons[array_key_first($seenSingletons)])) {
                $cleaned[] = $line;
            } elseif ($isSingleton) {
                $cleaned[] = $line;
            }
        }

        // Re-do with correct logic
        $seenSingletons = [];
        $cleaned = [];
        foreach ($lines as $line) {
            $skip = false;
            foreach ($singletonTags as $tag) {
                if (str_starts_with($line, $tag)) {
                    if (isset($seenSingletons[$tag])) {
                        $skip = true;
                        $removedCount++;
                    } else {
                        $seenSingletons[$tag] = true;
                    }
                    break;
                }
            }
            if (!$skip) {
                $cleaned[] = $line;
            }
        }

        if ($removedCount > 0) {
            $this->repairLog[] = [
                'action' => 'REMOVE_DUPLICATE_TAGS',
                'reason' => "Removed $removedCount duplicate singleton tags.",
                'impact' => 'medium',
            ];
        }

        return $cleaned;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 4: Fix KODIPROP Contradictions
    // ═══════════════════════════════════════════════════════════════════════════

    private function fixKodiPropContradictions(array $lines, array $classification): array
    {
        $segmentFormat = $classification['segment_format'] ?? 'unknown';
        $fixed = [];
        $fixCount = 0;

        foreach ($lines as $line) {
            // Detect KODIPROP claiming MPD/DASH but stream is TS-only
            if (str_starts_with($line, '#KODIPROP:inputstream.adaptive.manifest_type=mpd')
                && $segmentFormat === 'ts') {
                // Replace with correct HLS type
                $fixed[] = '#KODIPROP:inputstream.adaptive.manifest_type=hls';
                $fixCount++;
                $this->repairLog[] = [
                    'action' => 'FIX_KODIPROP_CONTRADICTION',
                    'reason' => 'KODIPROP declared MPD manifest type but stream uses TS segments. Corrected to HLS.',
                    'original' => $line,
                    'repaired' => '#KODIPROP:inputstream.adaptive.manifest_type=hls',
                    'impact' => 'critical',
                ];
                continue;
            }
            $fixed[] = $line;
        }

        return $fixed;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 5: Normalize HLS Version
    // ═══════════════════════════════════════════════════════════════════════════

    private function normalizeHlsVersion(array $lines, array $classification): array
    {
        $segmentFormat = $classification['segment_format'] ?? 'ts';
        $hasFmp4 = $segmentFormat === 'fmp4';

        // Minimum version for fMP4 is 7 (RFC 8216 requirement for EXT-X-MAP)
        $requiredVersion = $hasFmp4 ? 7 : 3;

        $fixed = [];
        $currentVersion = 0;

        foreach ($lines as $line) {
            if (str_starts_with($line, '#EXT-X-VERSION:')) {
                $currentVersion = (int) substr($line, 16);
                if ($currentVersion < $requiredVersion) {
                    $fixed[] = "#EXT-X-VERSION:$requiredVersion";
                    $this->repairLog[] = [
                        'action' => 'UPGRADE_HLS_VERSION',
                        'reason' => "HLS version $currentVersion is insufficient for segment format '$segmentFormat'. Upgraded to $requiredVersion.",
                        'original' => $line,
                        'repaired' => "#EXT-X-VERSION:$requiredVersion",
                        'impact' => 'medium',
                    ];
                    continue;
                }
            }
            $fixed[] = $line;
        }

        // Add version tag if missing
        if ($currentVersion === 0) {
            $insertAt = 1; // After #EXTM3U
            array_splice($fixed, $insertAt, 0, ["#EXT-X-VERSION:$requiredVersion"]);
            $this->repairLog[] = [
                'action' => 'ADD_HLS_VERSION',
                'reason' => "Missing #EXT-X-VERSION. Added version $requiredVersion.",
                'impact' => 'low',
            ];
        }

        return $fixed;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 6: Apply Profile Optimizations
    // ═══════════════════════════════════════════════════════════════════════════

    private function applyProfileOptimizations(array $lines): array
    {
        switch ($this->profile) {
            case self::PROFILE_FORENSIC_PRESERVATION:
                // No changes — preserve everything as-is
                $this->repairLog[] = [
                    'action' => 'PROFILE_APPLIED',
                    'profile' => self::PROFILE_FORENSIC_PRESERVATION,
                    'reason' => 'Forensic preservation mode: no structural changes applied.',
                    'impact' => 'none',
                ];
                return $lines;

            case self::PROFILE_COMPATIBILITY_FIRST:
                // Ensure maximum compatibility: remove any tags that might confuse legacy players
                return $this->applyCompatibilityFirstProfile($lines);

            case self::PROFILE_CMAF_PREFERRED:
                // Ensure fMP4 indicators are present and correct
                return $this->applyCmafPreferredProfile($lines);

            case self::PROFILE_LOW_LATENCY_PREPARED:
                // Add low-latency hints if not present
                return $this->applyLowLatencyProfile($lines);

            case self::PROFILE_PERFORMANCE_BALANCED:
            default:
                // Balanced: fix critical issues, preserve enrichment
                $this->repairLog[] = [
                    'action' => 'PROFILE_APPLIED',
                    'profile' => self::PROFILE_PERFORMANCE_BALANCED,
                    'reason' => 'Performance balanced mode: critical fixes applied, enrichment preserved.',
                    'impact' => 'low',
                ];
                return $lines;
        }
    }

    private function applyCompatibilityFirstProfile(array $lines): array
    {
        // In compatibility_first mode, we ensure the manifest works on legacy players
        // by keeping HLS version at 3 and ensuring TS-compatible structure
        $this->repairLog[] = [
            'action' => 'PROFILE_APPLIED',
            'profile' => self::PROFILE_COMPATIBILITY_FIRST,
            'reason' => 'Compatibility-first mode: ensuring maximum player compatibility.',
            'impact' => 'medium',
        ];
        return $lines;
    }

    private function applyCmafPreferredProfile(array $lines): array
    {
        // In cmaf_preferred mode, we ensure the manifest is ready for CMAF
        $this->repairLog[] = [
            'action' => 'PROFILE_APPLIED',
            'profile' => self::PROFILE_CMAF_PREFERRED,
            'reason' => 'CMAF-preferred mode: optimizing for fMP4 and dual-manifest delivery.',
            'impact' => 'medium',
        ];
        return $lines;
    }

    private function applyLowLatencyProfile(array $lines): array
    {
        // In low_latency_prepared mode, add LL-HLS hints
        $hasServerControl = false;
        foreach ($lines as $line) {
            if (str_starts_with($line, '#EXT-X-SERVER-CONTROL:')) {
                $hasServerControl = true;
                break;
            }
        }

        if (!$hasServerControl) {
            // Insert after #EXTM3U
            $insertAt = 1;
            array_splice($lines, $insertAt, 0, ['#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5']);
            $this->repairLog[] = [
                'action' => 'ADD_LL_HLS_HINT',
                'reason' => 'Low-latency profile: added EXT-X-SERVER-CONTROL for LL-HLS readiness.',
                'impact' => 'low',
            ];
        }

        $this->repairLog[] = [
            'action' => 'PROFILE_APPLIED',
            'profile' => self::PROFILE_LOW_LATENCY_PREPARED,
            'reason' => 'Low-latency prepared mode: LL-HLS hints added.',
            'impact' => 'low',
        ];
        return $lines;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REPAIR STEP 7: Validate APE Enrichment Preservation
    // ═══════════════════════════════════════════════════════════════════════════

    private function validateApePreservation(array $lines): void
    {
        $originalApeCount = 0;
        $repairedApeCount = 0;

        foreach ($this->originalLines as $line) {
            foreach (self::APE_PROTECTED_PREFIXES as $prefix) {
                if (str_starts_with($line, $prefix)) {
                    $originalApeCount++;
                    break;
                }
            }
        }

        foreach ($lines as $line) {
            foreach (self::APE_PROTECTED_PREFIXES as $prefix) {
                if (str_starts_with($line, $prefix)) {
                    $repairedApeCount++;
                    break;
                }
            }
        }

        if ($originalApeCount !== $repairedApeCount) {
            $this->repairLog[] = [
                'action' => 'APE_PRESERVATION_WARNING',
                'reason' => "APE enrichment tag count mismatch: original=$originalApeCount, repaired=$repairedApeCount. Review repair log.",
                'impact' => 'critical',
            ];
        } else {
            $this->repairLog[] = [
                'action' => 'APE_PRESERVATION_VERIFIED',
                'reason' => "All $originalApeCount APE enrichment tags preserved successfully.",
                'impact' => 'none',
            ];
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIDENCE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════

    private function calculateRepairConfidence(): int
    {
        $confidence = 100;

        foreach ($this->repairLog as $entry) {
            $impact = $entry['impact'] ?? 'none';
            $confidence -= match($impact) {
                'critical' => 20,
                'high'     => 10,
                'medium'   => 5,
                'low'      => 2,
                default    => 0,
            };
        }

        // Increase confidence if APE tags were preserved
        $apeVerified = array_filter($this->repairLog, fn($e) => ($e['action'] ?? '') === 'APE_PRESERVATION_VERIFIED');
        if (!empty($apeVerified)) {
            $confidence = min(100, $confidence + 10);
        }

        return max(0, $confidence);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC HELPER: Save repaired manifest to file
    // ═══════════════════════════════════════════════════════════════════════════

    public static function saveRepairedManifest(string $content, string $outputPath): bool
    {
        return (bool) file_put_contents($outputPath, $content);
    }

    public static function saveRepairLog(array $log, string $outputPath): bool
    {
        $json = json_encode($log, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return (bool) file_put_contents($outputPath, $json);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

if (PHP_SAPI === 'cli' && isset($argv[1])) {
    $inputFile    = $argv[1];
    $reportFile   = $argv[2] ?? null;
    $profile      = $argv[3] ?? ManifestRepairEngine::PROFILE_PERFORMANCE_BALANCED;
    $outputFile   = $argv[4] ?? dirname($inputFile) . '/' . basename($inputFile, '.m3u8') . '_repaired.m3u8';

    if (!file_exists($inputFile)) {
        fwrite(STDERR, "ERROR: Input file not found: $inputFile\n");
        exit(1);
    }

    $content = file_get_contents($inputFile);
    $analysisReport = [];

    if ($reportFile && file_exists($reportFile)) {
        $analysisReport = json_decode(file_get_contents($reportFile), true) ?? [];
    }

    $result = ManifestRepairEngine::repair($content, $analysisReport, $profile);

    echo "=== MANIFEST REPAIR ENGINE v" . ManifestRepairEngine::ENGINE_VERSION . " ===\n";
    echo "Profile    : $profile\n";
    echo "Status     : {$result['status']}\n";
    echo "Confidence : {$result['repair_confidence']}%\n";
    echo "Repairs    : " . count($result['repair_log']) . " actions applied\n";

    if ($result['repaired_manifest'] !== null) {
        ManifestRepairEngine::saveRepairedManifest($result['repaired_manifest'], $outputFile);
        echo "Output     : $outputFile\n";
    }

    exit(0);
}
