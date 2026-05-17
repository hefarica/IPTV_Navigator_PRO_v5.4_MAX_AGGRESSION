<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IPTV Navigator PRO — CMAF Architecture Layer                              ║
 * ║  Module: Manifest Forensics Engine (MFE) v1.0.0                            ║
 * ║                                                                            ║
 * ║  PURPOSE: Deep forensic analysis, syntax validation, codec detection,      ║
 * ║           health scoring, and CMAF readiness scoring for any M3U8          ║
 * ║           manifest. Non-destructive. Additive. Production-grade.           ║
 * ║                                                                            ║
 * ║  INTEGRATION: Called by cmaf_orchestrator.php before any packaging         ║
 * ║  decision is made. Preserves all existing APE toolkit logic.               ║
 * ║                                                                            ║
 * ║  OUTPUT: Structured JSON report with scores, classification, and           ║
 * ║          migration recommendations.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

class ManifestForensicsEngine
{
    // ─── Engine Version ──────────────────────────────────────────────────────
    const ENGINE_VERSION = '1.0.0';

    // ─── Scoring Weights ─────────────────────────────────────────────────────
    const HEALTH_WEIGHT_EXTM3U_MISSING     = -20;
    const HEALTH_WEIGHT_TARGETDURATION_BAD = -10;
    const HEALTH_WEIGHT_SEQUENCE_GAP       = -5;
    const HEALTH_WEIGHT_MIXED_SEGMENTS     = -15;
    const HEALTH_WEIGHT_CONTRADICTORY_TAGS = -10;
    const HEALTH_WEIGHT_NO_EXTINF          = -20;

    const CMAF_BONUS_FMP4_SEGMENTS         = 50;
    const CMAF_BONUS_EXT_X_MAP_VALID       = 20;
    const CMAF_BONUS_COMPATIBLE_CODECS     = 15;
    const CMAF_BONUS_ABR_ALIGNED           = 10;
    const CMAF_BONUS_CONSISTENT_STRUCTURE  = 5;

    // ─── Classification Constants ─────────────────────────────────────────────
    const SEGMENT_FORMAT_TS      = 'ts';
    const SEGMENT_FORMAT_FMP4    = 'fmp4';
    const SEGMENT_FORMAT_BYTERANGE = 'byte_range';
    const SEGMENT_FORMAT_UNKNOWN = 'unknown';
    const SEGMENT_FORMAT_MIXED   = 'mixed';

    const STREAM_TYPE_VOD     = 'VOD';
    const STREAM_TYPE_EVENT   = 'EVENT';
    const STREAM_TYPE_LIVE    = 'LIVE';
    const STREAM_TYPE_UNKNOWN = 'UNKNOWN';

    const MANIFEST_TYPE_HLS_MASTER  = 'HLS_MASTER';
    const MANIFEST_TYPE_HLS_MEDIA   = 'HLS_MEDIA';
    const MANIFEST_TYPE_HLS_TS      = 'HLS_TS';
    const MANIFEST_TYPE_HLS_FMP4    = 'HLS_FMP4';
    const MANIFEST_TYPE_PSEUDO_HLS  = 'PSEUDO_HLS';
    const MANIFEST_TYPE_MALFORMED   = 'MALFORMED';
    const MANIFEST_TYPE_PROPRIETARY = 'PROPRIETARY';

    const READINESS_LEGACY_ONLY         = 'legacy_ts_only';
    const READINESS_HLS_OPTIMIZED       = 'hls_optimized';
    const READINESS_PARTIAL_CMAF        = 'partial_cmaf_candidate';
    const READINESS_CMAF_READY          = 'cmaf_ready';
    const READINESS_DASH_CONVERTIBLE    = 'dash_convertible';
    const READINESS_LOW_LATENCY         = 'low_latency_candidate';

    const HEALTH_VALID        = 'valid';
    const HEALTH_DEGRADED     = 'degraded';
    const HEALTH_FRAGILE      = 'fragile';
    const HEALTH_BROKEN       = 'broken';
    const HEALTH_UNRECOVERABLE = 'unrecoverable';

    // ─── Player Compatibility Profiles ───────────────────────────────────────
    const PLAYER_PROFILES = [
        'safari_hls'       => ['prefers' => 'hls', 'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 9],
        'exoplayer_dash'   => ['prefers' => 'dash', 'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 7],
        'exoplayer_hls'    => ['prefers' => 'hls',  'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 7],
        'vlc'              => ['prefers' => 'hls',  'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 7],
        'kodi'             => ['prefers' => 'hls',  'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 7],
        'ott_navigator'    => ['prefers' => 'hls',  'supports_fmp4' => true,  'supports_hevc' => true,  'max_hls_version' => 7],
        'legacy_iptv'      => ['prefers' => 'hls',  'supports_fmp4' => false, 'supports_hevc' => false, 'max_hls_version' => 3],
    ];

    // ─── Codec Compatibility Map ──────────────────────────────────────────────
    const CMAF_COMPATIBLE_VIDEO_CODECS = ['avc1', 'hvc1', 'hev1', 'av01', 'vp09'];
    const CMAF_COMPATIBLE_AUDIO_CODECS = ['mp4a', 'ac-3', 'ec-3', 'opus', 'flac'];

    // ─── Internal State ───────────────────────────────────────────────────────
    private array $lines = [];
    private array $issues = [];
    private array $warnings = [];
    private string $channelId = '';
    private string $originalContent = '';

    /**
     * Main entry point. Analyzes a manifest and returns a structured report.
     *
     * @param string $manifestContent Raw M3U8 content as a string.
     * @param string $channelId       Unique identifier for the channel.
     * @return array                  Structured analysis report.
     */
    public static function analyze(string $manifestContent, string $channelId = 'unknown'): array
    {
        $engine = new self();
        $engine->channelId = $channelId;
        $engine->originalContent = $manifestContent;
        $engine->lines = array_filter(
            array_map('trim', explode("\n", $manifestContent)),
            fn($line) => $line !== ''
        );

        return $engine->runFullAnalysis();
    }

    /**
     * Orchestrates the full forensic analysis pipeline.
     */
    private function runFullAnalysis(): array
    {
        // ── Phase 1: Structural Analysis ──────────────────────────────────────
        $structuralData = $this->analyzeStructure();

        // ── Phase 2: Segment Analysis ─────────────────────────────────────────
        $segmentData = $this->analyzeSegments();

        // ── Phase 3: Codec & ABR Analysis ────────────────────────────────────
        $codecData = $this->analyzeCodecsAndAbr();

        // ── Phase 4: Health Scoring ───────────────────────────────────────────
        $healthScore = $this->calculateHealthScore($structuralData, $segmentData, $codecData);

        // ── Phase 5: CMAF Readiness Scoring ──────────────────────────────────
        $cmafScore = $this->calculateCmafReadinessScore($segmentData, $codecData, $structuralData);

        // ── Phase 6: Player Compatibility Scoring ─────────────────────────────
        $compatibilityScores = $this->calculatePlayerCompatibility($segmentData, $codecData, $structuralData);

        // ── Phase 7: Classification & Recommendation ──────────────────────────
        $classification = $this->classify($structuralData, $segmentData, $cmafScore, $healthScore);

        // ── Phase 8: Assemble Final Report ───────────────────────────────────
        return $this->assembleReport(
            $structuralData,
            $segmentData,
            $codecData,
            $healthScore,
            $cmafScore,
            $compatibilityScores,
            $classification
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: STRUCTURAL ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    private function analyzeStructure(): array
    {
        $data = [
            'has_extm3u'             => false,
            'is_master_playlist'     => false,
            'hls_version'            => 0,
            'target_duration'        => 0,
            'playlist_type'          => null,
            'has_endlist'            => false,
            'media_sequence_start'   => null,
            'media_sequence_values'  => [],
            'extinf_count'           => 0,
            'stream_inf_count'       => 0,
            'has_ext_x_map'          => false,
            'ext_x_map_uri'          => null,
            'has_low_latency_tags'   => false,
            'has_ape_proprietary'    => false,
            'has_kodiprop'           => false,
            'has_extvlcopt'          => false,
            'has_exthttp'            => false,
            'has_extattrfromurl'     => false,
            'line_count'             => count($this->lines),
        ];

        $lastSequence = null;

        foreach ($this->lines as $line) {
            // Core HLS Tags
            if (str_starts_with($line, '#EXTM3U'))                $data['has_extm3u'] = true;
            if (str_starts_with($line, '#EXT-X-STREAM-INF'))      { $data['is_master_playlist'] = true; $data['stream_inf_count']++; }
            if (str_starts_with($line, '#EXT-X-VERSION:'))        $data['hls_version'] = (int) substr($line, 16);
            if (str_starts_with($line, '#EXT-X-TARGETDURATION:')) $data['target_duration'] = (int) substr($line, 23);
            if (str_starts_with($line, '#EXT-X-PLAYLIST-TYPE:'))  $data['playlist_type'] = trim(substr($line, 22));
            if (str_starts_with($line, '#EXT-X-ENDLIST'))         $data['has_endlist'] = true;
            if (str_starts_with($line, '#EXTINF'))                $data['extinf_count']++;

            // Media Sequence Tracking
            if (str_starts_with($line, '#EXT-X-MEDIA-SEQUENCE:')) {
                $seq = (int) substr($line, 23);
                $data['media_sequence_values'][] = $seq;
                if ($data['media_sequence_start'] === null) $data['media_sequence_start'] = $seq;
                if ($lastSequence !== null && $seq !== $lastSequence + 1) {
                    $this->issues[] = "Sequence gap detected: expected " . ($lastSequence + 1) . ", got $seq";
                }
                $lastSequence = $seq;
            }

            // CMAF / fMP4 Tags
            if (str_starts_with($line, '#EXT-X-MAP:')) {
                $data['has_ext_x_map'] = true;
                if (preg_match('/URI="([^"]+)"/', $line, $m)) $data['ext_x_map_uri'] = $m[1];
            }

            // Low Latency Tags
            if (str_starts_with($line, '#EXT-X-PART') || str_starts_with($line, '#EXT-X-SERVER-CONTROL')) {
                $data['has_low_latency_tags'] = true;
            }

            // APE Proprietary Tags
            if (str_starts_with($line, '#EXT-X-APE-') || str_starts_with($line, '#EXT-X-SYS-')) $data['has_ape_proprietary'] = true;
            if (str_starts_with($line, '#KODIPROP'))         $data['has_kodiprop'] = true;
            if (str_starts_with($line, '#EXTVLCOPT'))        $data['has_extvlcopt'] = true;
            if (str_starts_with($line, '#EXTHTTP'))          $data['has_exthttp'] = true;
            if (str_starts_with($line, '#EXTATTRFROMURL'))   $data['has_extattrfromurl'] = true;
        }

        // Determine stream type
        if ($data['has_endlist']) {
            $data['stream_type'] = self::STREAM_TYPE_VOD;
        } elseif ($data['playlist_type'] === 'EVENT') {
            $data['stream_type'] = self::STREAM_TYPE_EVENT;
        } elseif ($data['extinf_count'] > 0 || $data['stream_inf_count'] > 0) {
            $data['stream_type'] = self::STREAM_TYPE_LIVE;
        } else {
            $data['stream_type'] = self::STREAM_TYPE_UNKNOWN;
        }

        if (!$data['has_extm3u']) {
            $this->issues[] = 'Missing #EXTM3U header — manifest is malformed.';
        }

        return $data;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: SEGMENT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    private function analyzeSegments(): array
    {
        $data = [
            'segment_format'        => self::SEGMENT_FORMAT_UNKNOWN,
            'ts_count'              => 0,
            'fmp4_count'            => 0,
            'byterange_count'       => 0,
            'segment_durations'     => [],
            'avg_segment_duration'  => 0.0,
            'max_segment_duration'  => 0.0,
            'min_segment_duration'  => 0.0,
            'duration_consistent'   => true,
            'segment_urls'          => [],
            'has_relative_paths'    => false,
            'has_absolute_paths'    => false,
        ];

        $prevLineWasExtinf = false;
        $currentDuration = 0.0;

        foreach ($this->lines as $line) {
            if (str_starts_with($line, '#EXTINF:')) {
                $parts = explode(',', substr($line, 8));
                $currentDuration = (float) $parts[0];
                $data['segment_durations'][] = $currentDuration;
                $prevLineWasExtinf = true;
                continue;
            }

            if ($prevLineWasExtinf && !str_starts_with($line, '#')) {
                $data['segment_urls'][] = $line;

                // Detect segment format from URL
                if (preg_match('/\.(ts|aac|mp3)(\?.*)?$/i', $line)) {
                    $data['ts_count']++;
                } elseif (preg_match('/\.(m4s|mp4|fmp4)(\?.*)?$/i', $line)) {
                    $data['fmp4_count']++;
                } elseif (str_contains($line, 'byterange') || str_contains($line, 'byte_range')) {
                    $data['byterange_count']++;
                }

                // Detect path type
                if (str_starts_with($line, 'http://') || str_starts_with($line, 'https://')) {
                    $data['has_absolute_paths'] = true;
                } else {
                    $data['has_relative_paths'] = true;
                }

                $prevLineWasExtinf = false;
            } else {
                $prevLineWasExtinf = false;
            }
        }

        // Determine dominant segment format
        if ($data['ts_count'] > 0 && $data['fmp4_count'] > 0) {
            $data['segment_format'] = self::SEGMENT_FORMAT_MIXED;
            $this->issues[] = 'Mixed segment formats detected (TS and fMP4). This is invalid per RFC 8216.';
        } elseif ($data['fmp4_count'] > 0) {
            $data['segment_format'] = self::SEGMENT_FORMAT_FMP4;
        } elseif ($data['ts_count'] > 0) {
            $data['segment_format'] = self::SEGMENT_FORMAT_TS;
        } elseif ($data['byterange_count'] > 0) {
            $data['segment_format'] = self::SEGMENT_FORMAT_BYTERANGE;
        }

        // Calculate duration statistics
        if (!empty($data['segment_durations'])) {
            $data['avg_segment_duration'] = round(array_sum($data['segment_durations']) / count($data['segment_durations']), 3);
            $data['max_segment_duration'] = max($data['segment_durations']);
            $data['min_segment_duration'] = min($data['segment_durations']);

            // Check consistency (allow 10% variance)
            $variance = $data['max_segment_duration'] - $data['min_segment_duration'];
            if ($data['avg_segment_duration'] > 0 && ($variance / $data['avg_segment_duration']) > 0.10) {
                $data['duration_consistent'] = false;
                $this->warnings[] = "Segment duration inconsistency detected: min={$data['min_segment_duration']}s, max={$data['max_segment_duration']}s";
            }
        }

        return $data;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: CODEC & ABR ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    private function analyzeCodecsAndAbr(): array
    {
        $data = [
            'detected_video_codecs' => [],
            'detected_audio_codecs' => [],
            'abr_ladder'            => [],
            'has_hevc'              => false,
            'has_h264'              => false,
            'has_av1'               => false,
            'has_aac'               => false,
            'has_ac3'               => false,
            'codecs_are_cmaf_compatible' => false,
        ];

        foreach ($this->lines as $line) {
            if (!str_starts_with($line, '#EXT-X-STREAM-INF:')) continue;

            $rendition = ['resolution' => null, 'bandwidth' => null, 'codecs' => null, 'frame_rate' => null];

            // Extract BANDWIDTH
            if (preg_match('/BANDWIDTH=(\d+)/i', $line, $m)) {
                $rendition['bandwidth'] = (int) $m[1];
            }

            // Extract RESOLUTION
            if (preg_match('/RESOLUTION=(\d+x\d+)/i', $line, $m)) {
                $rendition['resolution'] = $m[1];
            }

            // Extract CODECS
            if (preg_match('/CODECS="([^"]+)"/i', $line, $m)) {
                $rendition['codecs'] = $m[1];
                $codecList = array_map('trim', explode(',', $m[1]));

                foreach ($codecList as $codec) {
                    $codecLower = strtolower($codec);
                    if (str_starts_with($codecLower, 'avc1') || str_starts_with($codecLower, 'h264')) {
                        $data['has_h264'] = true;
                        $data['detected_video_codecs'][] = $codec;
                    } elseif (str_starts_with($codecLower, 'hvc1') || str_starts_with($codecLower, 'hev1')) {
                        $data['has_hevc'] = true;
                        $data['detected_video_codecs'][] = $codec;
                    } elseif (str_starts_with($codecLower, 'av01')) {
                        $data['has_av1'] = true;
                        $data['detected_video_codecs'][] = $codec;
                    } elseif (str_starts_with($codecLower, 'mp4a')) {
                        $data['has_aac'] = true;
                        $data['detected_audio_codecs'][] = $codec;
                    } elseif (str_starts_with($codecLower, 'ac-3') || str_starts_with($codecLower, 'ec-3')) {
                        $data['has_ac3'] = true;
                        $data['detected_audio_codecs'][] = $codec;
                    }
                }
            }

            // Extract FRAME-RATE
            if (preg_match('/FRAME-RATE=([\d.]+)/i', $line, $m)) {
                $rendition['frame_rate'] = (float) $m[1];
            }

            $data['abr_ladder'][] = $rendition;
        }

        // Deduplicate codec lists
        $data['detected_video_codecs'] = array_unique($data['detected_video_codecs']);
        $data['detected_audio_codecs'] = array_unique($data['detected_audio_codecs']);

        // Check CMAF codec compatibility
        $hasCompatibleVideo = $data['has_h264'] || $data['has_hevc'] || $data['has_av1'];
        $hasCompatibleAudio = $data['has_aac'] || $data['has_ac3'];
        $data['codecs_are_cmaf_compatible'] = $hasCompatibleVideo && $hasCompatibleAudio;

        return $data;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: HEALTH SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    private function calculateHealthScore(array $structural, array $segments, array $codecs): array
    {
        $score = 100;
        $deductions = [];

        if (!$structural['has_extm3u']) {
            $score += self::HEALTH_WEIGHT_EXTM3U_MISSING;
            $deductions[] = ['reason' => 'Missing #EXTM3U', 'points' => self::HEALTH_WEIGHT_EXTM3U_MISSING];
        }

        if (!$segments['duration_consistent']) {
            $score += self::HEALTH_WEIGHT_TARGETDURATION_BAD;
            $deductions[] = ['reason' => 'Inconsistent segment durations', 'points' => self::HEALTH_WEIGHT_TARGETDURATION_BAD];
        }

        if (count($this->issues) > 0) {
            $gapCount = count(array_filter($this->issues, fn($i) => str_contains($i, 'Sequence gap')));
            if ($gapCount > 0) {
                $penalty = $gapCount * self::HEALTH_WEIGHT_SEQUENCE_GAP;
                $score += $penalty;
                $deductions[] = ['reason' => "Sequence gaps ($gapCount)", 'points' => $penalty];
            }
        }

        if ($segments['segment_format'] === self::SEGMENT_FORMAT_MIXED) {
            $score += self::HEALTH_WEIGHT_MIXED_SEGMENTS;
            $deductions[] = ['reason' => 'Mixed segment formats (TS + fMP4)', 'points' => self::HEALTH_WEIGHT_MIXED_SEGMENTS];
        }

        if ($structural['extinf_count'] === 0 && $structural['stream_inf_count'] === 0) {
            $score += self::HEALTH_WEIGHT_NO_EXTINF;
            $deductions[] = ['reason' => 'No #EXTINF or #EXT-X-STREAM-INF found', 'points' => self::HEALTH_WEIGHT_NO_EXTINF];
        }

        $score = max(0, $score);

        // Determine health classification
        $healthClass = match(true) {
            $score >= 90 => self::HEALTH_VALID,
            $score >= 70 => self::HEALTH_DEGRADED,
            $score >= 50 => self::HEALTH_FRAGILE,
            $score >= 20 => self::HEALTH_BROKEN,
            default      => self::HEALTH_UNRECOVERABLE,
        };

        return [
            'score'          => $score,
            'classification' => $healthClass,
            'deductions'     => $deductions,
            'issues'         => $this->issues,
            'warnings'       => $this->warnings,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: CMAF READINESS SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    private function calculateCmafReadinessScore(array $segments, array $codecs, array $structural): array
    {
        $score = 0;
        $bonuses = [];

        if ($segments['segment_format'] === self::SEGMENT_FORMAT_FMP4) {
            $score += self::CMAF_BONUS_FMP4_SEGMENTS;
            $bonuses[] = ['reason' => 'Native fMP4 segments detected', 'points' => self::CMAF_BONUS_FMP4_SEGMENTS];
        }

        if ($structural['has_ext_x_map'] && $structural['ext_x_map_uri'] !== null) {
            $score += self::CMAF_BONUS_EXT_X_MAP_VALID;
            $bonuses[] = ['reason' => 'Valid #EXT-X-MAP directive present', 'points' => self::CMAF_BONUS_EXT_X_MAP_VALID];
        }

        if ($codecs['codecs_are_cmaf_compatible']) {
            $score += self::CMAF_BONUS_COMPATIBLE_CODECS;
            $bonuses[] = ['reason' => 'CMAF-compatible codecs (H.264/HEVC/AV1 + AAC/AC3)', 'points' => self::CMAF_BONUS_COMPATIBLE_CODECS];
        }

        if ($segments['duration_consistent'] && $segments['avg_segment_duration'] > 0) {
            $score += self::CMAF_BONUS_ABR_ALIGNED;
            $bonuses[] = ['reason' => 'Consistent segment durations (ABR alignment)', 'points' => self::CMAF_BONUS_ABR_ALIGNED];
        }

        if ($structural['has_extm3u'] && $structural['extinf_count'] > 0) {
            $score += self::CMAF_BONUS_CONSISTENT_STRUCTURE;
            $bonuses[] = ['reason' => 'Consistent manifest structure', 'points' => self::CMAF_BONUS_CONSISTENT_STRUCTURE];
        }

        $score = min(100, $score);

        // Determine readiness classification
        $readinessClass = match(true) {
            $score >= 81 => self::READINESS_CMAF_READY,
            $score >= 61 => self::READINESS_DASH_CONVERTIBLE,
            $score >= 41 => self::READINESS_PARTIAL_CMAF,
            $score >= 21 => self::READINESS_HLS_OPTIMIZED,
            default      => self::READINESS_LEGACY_ONLY,
        };

        // Determine migration recommendation
        $migrationRecommendation = match($readinessClass) {
            self::READINESS_CMAF_READY       => 'prepare_hls_dash',
            self::READINESS_DASH_CONVERTIBLE => 'remux_to_cmaf',
            self::READINESS_PARTIAL_CMAF     => 'remux_to_cmaf',
            self::READINESS_HLS_OPTIMIZED    => 'normalize_hls_only',
            default                          => 'keep_as_ts',
        };

        return [
            'score'                   => $score,
            'readiness_classification' => $readinessClass,
            'migration_recommendation' => $migrationRecommendation,
            'bonuses'                 => $bonuses,
            'low_latency_candidate'   => $structural['has_low_latency_tags'] || $segments['avg_segment_duration'] <= 1.5,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 6: PLAYER COMPATIBILITY SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    private function calculatePlayerCompatibility(array $segments, array $codecs, array $structural): array
    {
        $scores = [];

        foreach (self::PLAYER_PROFILES as $playerName => $profile) {
            $playerScore = 100;

            // Penalize if player doesn't support fMP4 but stream uses it
            if ($segments['segment_format'] === self::SEGMENT_FORMAT_FMP4 && !$profile['supports_fmp4']) {
                $playerScore -= 40;
            }

            // Penalize if player doesn't support HEVC but stream requires it
            if ($codecs['has_hevc'] && !$codecs['has_h264'] && !$profile['supports_hevc']) {
                $playerScore -= 30;
            }

            // Penalize if HLS version is too high
            if ($structural['hls_version'] > $profile['max_hls_version']) {
                $playerScore -= 15;
            }

            // Penalize for mixed segments (universally bad)
            if ($segments['segment_format'] === self::SEGMENT_FORMAT_MIXED) {
                $playerScore -= 25;
            }

            $scores[$playerName] = max(0, $playerScore);
        }

        return $scores;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7: CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    private function classify(array $structural, array $segments, array $cmafScore, array $healthScore): array
    {
        // Determine manifest type
        $manifestType = self::MANIFEST_TYPE_MALFORMED;
        if ($structural['has_extm3u']) {
            if ($structural['is_master_playlist']) {
                $manifestType = self::MANIFEST_TYPE_HLS_MASTER;
            } elseif ($segments['segment_format'] === self::SEGMENT_FORMAT_FMP4) {
                $manifestType = self::MANIFEST_TYPE_HLS_FMP4;
            } elseif ($segments['segment_format'] === self::SEGMENT_FORMAT_TS) {
                $manifestType = self::MANIFEST_TYPE_HLS_TS;
            } elseif ($structural['has_ape_proprietary'] || $structural['has_extattrfromurl']) {
                $manifestType = self::MANIFEST_TYPE_PROPRIETARY;
            } else {
                $manifestType = self::MANIFEST_TYPE_HLS_MEDIA;
            }
        }

        return [
            'manifest_type'            => $manifestType,
            'stream_type'              => $structural['stream_type'],
            'segment_format'           => $segments['segment_format'],
            'readiness_classification' => $cmafScore['readiness_classification'],
            'health_classification'    => $healthScore['classification'],
            'is_cmaf_ready'            => $cmafScore['score'] >= 81,
            'is_repairable'            => $healthScore['score'] >= 20,
            'has_ape_enrichment'       => $structural['has_ape_proprietary'] || $structural['has_kodiprop'] || $structural['has_extvlcopt'],
            'migration_recommendation' => $cmafScore['migration_recommendation'],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 8: REPORT ASSEMBLY
    // ═══════════════════════════════════════════════════════════════════════════

    private function assembleReport(
        array $structural,
        array $segments,
        array $codecs,
        array $healthScore,
        array $cmafScore,
        array $compatibilityScores,
        array $classification
    ): array {
        return [
            'metadata' => [
                'channel_id'             => $this->channelId,
                'analysis_timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
                'engine_version'         => self::ENGINE_VERSION,
                'original_manifest_fingerprint' => hash('sha256', $this->originalContent),
                'original_line_count'    => count($this->lines),
            ],
            'scores' => [
                'manifest_health_score'  => $healthScore['score'],
                'cmaf_readiness_score'   => $cmafScore['score'],
                'player_compatibility'   => $compatibilityScores,
            ],
            'classification' => $classification,
            'details' => [
                'structural'             => $structural,
                'segments'               => $segments,
                'codecs'                 => $codecs,
                'health_deductions'      => $healthScore['deductions'],
                'cmaf_bonuses'           => $cmafScore['bonuses'],
                'detected_issues'        => $healthScore['issues'],
                'detected_warnings'      => $healthScore['warnings'],
                'low_latency_candidate'  => $cmafScore['low_latency_candidate'],
            ],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC HELPER: Save report to JSON file
    // ═══════════════════════════════════════════════════════════════════════════

    public static function saveReport(array $report, string $outputPath): bool
    {
        $json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) return false;
        return (bool) file_put_contents($outputPath, $json);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT (for direct invocation from command line or orchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

if (PHP_SAPI === 'cli' && isset($argv[1])) {
    $inputFile  = $argv[1];
    $channelId  = $argv[2] ?? basename($inputFile, '.m3u8');
    $outputFile = $argv[3] ?? dirname($inputFile) . '/' . $channelId . '_analysis_report.json';

    if (!file_exists($inputFile)) {
        fwrite(STDERR, "ERROR: Input file not found: $inputFile\n");
        exit(1);
    }

    $content = file_get_contents($inputFile);
    if ($content === false) {
        fwrite(STDERR, "ERROR: Cannot read file: $inputFile\n");
        exit(1);
    }

    $report = ManifestForensicsEngine::analyze($content, $channelId);
    ManifestForensicsEngine::saveReport($report, $outputFile);

    echo "=== MANIFEST FORENSICS ENGINE v" . ManifestForensicsEngine::ENGINE_VERSION . " ===\n";
    echo "Channel ID : {$report['metadata']['channel_id']}\n";
    echo "Health Score: {$report['scores']['manifest_health_score']}/100 ({$report['classification']['health_classification']})\n";
    echo "CMAF Score  : {$report['scores']['cmaf_readiness_score']}/100 ({$report['classification']['readiness_classification']})\n";
    echo "Recommendation: {$report['classification']['migration_recommendation']}\n";
    echo "Report saved: $outputFile\n";
    exit(0);
}
