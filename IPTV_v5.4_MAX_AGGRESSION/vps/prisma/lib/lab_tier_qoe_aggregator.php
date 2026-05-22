<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LAB Tier QoE Aggregator v1.0 — Conviva→LAB feedback loop (Feature 1)     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Closes the QoE feedback loop in the Disney model: measured server-side QoE
 * (VST_proxy, rebuffer, errors) is aggregated PER PROFILE (P0-P5) and turned
 * into a recalibration SUGGESTION (target_factor) written to a feedback JSON.
 *
 * Called from qoe-flush.php on every 60s flush cycle, with the same per-channel
 * metrics array (each metric carries a "profile" field, set by the observer
 * from the X-APE-Profile header). Channel → profile is resolved at observe time
 * (runtime header), so this aggregator is pure offline grouping — ZERO hot path.
 *
 * ═══ DOCTRINE: OBSERVE-ONLY (autopista) ═══
 *   - This writes SUGGESTIONS only. It does NOT auto-apply to decision_engine.lua
 *     in production (avoids oscillation; respects Lua observe-only 24-72h rule).
 *   - The Excel LAB consumes lab_tier_qoe_feedback.json on next recalibration
 *     (human-in-the-loop). lab_config.lua exposes it for telemetry visibility.
 *   - HYSTERESIS: target_factor only moves if avg_vst breach is SUSTAINED and at
 *     least MIN_ADJUST_WINDOW_S elapsed since last adjustment. Bounded [0.5, 1.5].
 *
 * @package vps\prisma\lib
 * @version 1.0.0
 */

final class LabTierQoeAggregator
{
    /** Feedback JSON path (same dir lab_config.lua reads from). */
    private const FEEDBACK_FILE = __DIR__ . '/../config/lab_tier_qoe_feedback.json';

    /** Min requests in a profile bucket to consider the sample significant. */
    private const MIN_SAMPLES = 20;

    /** VST above this (ms) = degraded → suggest lowering target (stabilize). */
    private const VST_DEGRADED_MS = 1500;

    /** VST below this (ms) + low rebuffer = excellent → suggest raising target. */
    private const VST_EXCELLENT_MS = 500;

    /** Rebuffer ratio below this = healthy enough to upscale. */
    private const REBUFFER_HEALTHY = 0.005;

    /** Min seconds between target_factor adjustments per profile (6h hysteresis). */
    private const MIN_ADJUST_WINDOW_S = 21600;

    /** target_factor bounds. */
    private const FACTOR_MIN = 0.5;
    private const FACTOR_MAX = 1.5;
    private const FACTOR_DOWN_STEP = 0.20;
    private const FACTOR_UP_STEP = 0.10;

    /**
     * Aggregate per-profile and persist suggestions. Pure offline — safe.
     *
     * @param array $metrics  per-channel rows: [{channel_id, profile, vst_proxy_avg, rebuffer_count, request_count, error_count}, ...]
     * @param int   $bucket   5-min bucket id
     * @param ConvivaPersistence|null $persist optional, to also persist rows to SQLite
     * @return array          summary {profiles_updated, profiles: {...}}
     */
    public static function aggregate(array $metrics, int $bucket, $persist = null): array
    {
        // ── Group per profile ──
        $byProfile = [];   // P0..P5 → {vst_weighted_sum, req_sum, rebuf_sum, err_sum}
        foreach ($metrics as $m) {
            $profile = strtoupper((string)($m['profile'] ?? 'P3'));
            if (!preg_match('/^P[0-5]$/', $profile)) {
                $profile = 'P3';
            }
            $req = max(0, (int)($m['request_count'] ?? 0));
            $vst = max(0, (int)($m['vst_proxy_avg'] ?? 0));
            $rebuf = max(0, (int)($m['rebuffer_count'] ?? 0));
            $err = max(0, (int)($m['error_count'] ?? 0));
            // [F5 2026-05-21] enriched signals (context only; do NOT drive target_factor yet)
            $e4   = max(0, (int)($m['err4xx'] ?? 0));
            $e5   = max(0, (int)($m['err5xx'] ?? 0));
            $rdir = max(0, (int)($m['redirect_count'] ?? 0));
            $lat  = max(0, (int)($m['seg_latency_ms'] ?? 0));

            if (!isset($byProfile[$profile])) {
                $byProfile[$profile] = ['vst_w' => 0, 'req' => 0, 'rebuf' => 0, 'err' => 0, 'vst_n' => 0,
                                        'e4' => 0, 'e5' => 0, 'rdir' => 0, 'lat_w' => 0, 'lat_n' => 0];
            }
            // VST weighted by request_count (more requests = more confidence)
            $w = $req > 0 ? $req : 1;
            $byProfile[$profile]['vst_w'] += $vst * $w;
            $byProfile[$profile]['vst_n'] += $w;
            $byProfile[$profile]['req'] += $req;
            $byProfile[$profile]['rebuf'] += $rebuf;
            $byProfile[$profile]['err'] += $err;
            $byProfile[$profile]['e4'] += $e4;
            $byProfile[$profile]['e5'] += $e5;
            $byProfile[$profile]['rdir'] += $rdir;
            if ($lat > 0) { $byProfile[$profile]['lat_w'] += $lat * $w; $byProfile[$profile]['lat_n'] += $w; }
        }

        if (empty($byProfile)) {
            return ['profiles_updated' => 0, 'profiles' => []];
        }

        // ── Load previous feedback (for hysteresis) ──
        $prev = self::loadFeedback();
        $prevProfiles = is_array($prev['profiles'] ?? null) ? $prev['profiles'] : [];
        $now = time();

        $outProfiles = [];
        $updated = 0;

        foreach ($byProfile as $profile => $agg) {
            $avgVst = $agg['vst_n'] > 0 ? (int)round($agg['vst_w'] / $agg['vst_n']) : 0;
            $rebufferRatio = $agg['req'] > 0 ? round($agg['rebuf'] / $agg['req'], 5) : 0.0;
            $errorRatio = $agg['req'] > 0 ? round($agg['err'] / $agg['req'], 5) : 0.0;
            $samples = $agg['req'];
            // [F5 2026-05-21] enriched aggregates (context for feedback.json + F4 + future rules)
            $avgSegLatencyMs = $agg['lat_n'] > 0 ? (int)round($agg['lat_w'] / $agg['lat_n']) : 0;
            $err4Ratio = $agg['req'] > 0 ? round($agg['e4'] / $agg['req'], 5) : 0.0;
            $err5Ratio = $agg['req'] > 0 ? round($agg['e5'] / $agg['req'], 5) : 0.0;
            $redirectRatio = $agg['req'] > 0 ? round($agg['rdir'] / $agg['req'], 5) : 0.0;

            // Previous state for this profile
            $p = $prevProfiles[$profile] ?? [];
            $prevFactor = isset($p['target_factor']) ? (float)$p['target_factor'] : 1.0;
            $lastAdjusted = (int)($p['last_adjusted_ts'] ?? 0);
            $newFactor = $prevFactor;
            $action = 'HOLD';

            // ── Hysteresis-gated suggestion ──
            $windowOk = ($now - $lastAdjusted) >= self::MIN_ADJUST_WINDOW_S;
            if ($samples >= self::MIN_SAMPLES && $windowOk) {
                if ($avgVst > self::VST_DEGRADED_MS) {
                    // Degraded: suggest lowering target (lighter stream = more stable)
                    $newFactor = max(self::FACTOR_MIN, round($prevFactor - self::FACTOR_DOWN_STEP, 2));
                    $action = 'SUGGEST_DOWNSCALE';
                } elseif ($avgVst > 0 && $avgVst < self::VST_EXCELLENT_MS && $rebufferRatio < self::REBUFFER_HEALTHY) {
                    // Excellent: headroom to raise target (better quality)
                    $newFactor = min(self::FACTOR_MAX, round($prevFactor + self::FACTOR_UP_STEP, 2));
                    $action = 'SUGGEST_UPSCALE';
                }
            } elseif ($samples < self::MIN_SAMPLES) {
                $action = 'INSUFFICIENT_SAMPLES';
            } elseif (!$windowOk) {
                $action = 'WINDOW_COOLDOWN';
            }

            $changed = abs($newFactor - $prevFactor) > 0.001;

            $outProfiles[$profile] = [
                'avg_vst_ms'      => $avgVst,
                'rebuffer_ratio'  => $rebufferRatio,
                'error_ratio'     => $errorRatio,
                'samples'         => $samples,
                'target_factor'   => $newFactor,           // SUGGESTION for next LAB calibration
                'action'          => $action,
                'last_adjusted_ts' => $changed ? $now : $lastAdjusted,
                'observed_at'     => $now,
                'avg_seg_latency_ms' => $avgSegLatencyMs,  // [F5] upstream segment latency
                'err4xx_ratio'    => $err4Ratio,           // [F5] client error ratio
                'err5xx_ratio'    => $err5Ratio,           // [F5] upstream error ratio
                'redirect_ratio'  => $redirectRatio,       // [F5] 302/301 churn ratio
            ];
            if ($changed) {
                $updated++;
            }

            // Optional SQLite persistence (history)
            if ($persist !== null && method_exists($persist, 'recordProfileQoE')) {
                try {
                    $persist->recordProfileQoE($profile, $bucket, $avgVst, $rebufferRatio, $errorRatio, $samples, $newFactor);
                } catch (\Throwable $e) {
                    error_log('[lab_tier_qoe] persist error: ' . $e->getMessage());
                }
            }
        }

        // ── Write feedback JSON (atomic) ──
        self::writeFeedback([
            '_schema'     => 'lab_tier_qoe_feedback/1.0',
            '_doc'        => 'OBSERVE-ONLY suggestions. Consumed by Excel LAB recalibration + lab_config.lua telemetry. NOT auto-applied to decision_engine.',
            'updated_at'  => $now,
            'bucket_5min' => $bucket,
            'profiles'    => $outProfiles,
        ]);

        return ['profiles_updated' => $updated, 'profiles' => $outProfiles];
    }

    private static function loadFeedback(): array
    {
        if (!is_file(self::FEEDBACK_FILE)) {
            return ['profiles' => []];
        }
        $raw = @file_get_contents(self::FEEDBACK_FILE);
        if ($raw === false || $raw === '') {
            return ['profiles' => []];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : ['profiles' => []];
    }

    private static function writeFeedback(array $data): bool
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }
        // Atomic write: tmp + rename (avoids lab_config.lua reading a half-written file)
        $tmp = self::FEEDBACK_FILE . '.tmp_' . getmypid();
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            return false;
        }
        return @rename($tmp, self::FEEDBACK_FILE);
    }
}
