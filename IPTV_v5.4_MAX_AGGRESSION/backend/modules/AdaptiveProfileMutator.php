<?php
/**
 * AdaptiveProfileMutator v3.0
 *
 * Dynamically adjusts the resolver's profile level (P0→P5) and resilience parameters
 * based on real telemetry from RuntimeFeedbackCollector.
 *
 * Logic:
 * - If health_score < 50: downgrade profile (P2→P3, P3→P4) + increase buffers
 * - If health_score > 90 and stable for 5+ samples: upgrade profile (P3→P2)
 * - If error_rate > 0.3: switch to maximum resilience mode
 * - Cooldown: no mutation within 60 seconds of last mutation
 *
 * Anti-509: This module NEVER touches provider URLs.
 */
class AdaptiveProfileMutator
{
    private RuntimeFeedbackCollector $feedback;
    private string $cooldownPath;
    private int $cooldownSeconds = 60;

    private array $profileOrder = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

    public function __construct(RuntimeFeedbackCollector $feedback, string $cooldownDirPath)
    {
        $this->feedback = $feedback;
        $this->cooldownPath = rtrim($cooldownDirPath, '/');
        if (!is_dir($this->cooldownPath)) {
            @mkdir($this->cooldownPath, 0755, true);
        }
    }

    /**
     * Mutate the pipeline state based on telemetry.
     * Returns $state with potentially modified profile level + resilience.
     */
    public function mutate(array $state, string $channelId): array
    {
        $telemetry = $this->feedback->getChannelTelemetry(channelId: $channelId);

        // No data yet = no mutation (v2.5 behavior)
        if (!($telemetry['has_data'] ?? false) || ($telemetry['samples'] ?? 0) < 2) {
            return $state;
        }

        // Check cooldown
        if ($this->isInCooldown($channelId)) {
            return $state;
        }

        $health    = (float)($telemetry['health_score'] ?? 100);
        $errorRate = (float)($telemetry['error_rate'] ?? 0);
        $samples   = (int)($telemetry['samples'] ?? 0);
        $mutated   = false;

        // Current profile from content_profile
        $currentProfile = $state['content_profile']['level'] ?? 'P3';
        $currentIdx = array_search($currentProfile, $this->profileOrder);
        if ($currentIdx === false) $currentIdx = 3; // default P3

        // ── DEGRADATION: health is bad → downgrade profile
        if ($health < 50 && $currentIdx < 5) {
            $newIdx = min(5, $currentIdx + 1);
            $state['content_profile']['level'] = $this->profileOrder[$newIdx];
            $state['content_profile']['mutation_reason'] = "health_low_{$health}";
            $mutated = true;

            // Increase buffer by 30%
            if (isset($state['resilience_config']['buffer_ms'])) {
                $state['resilience_config']['buffer_ms'] = (int)($state['resilience_config']['buffer_ms'] * 1.3);
            }
        }

        // ── CRITICAL: high error rate → maximum resilience
        if ($errorRate > 0.3) {
            $state['resilience_config']['reconnect_max_attempts'] = 999999;
            $state['resilience_config']['reconnect_delay_pattern'] = '50,100,200,500';
            $state['resilience_config']['timeout_multiplier'] = 2.0;
            $state['content_profile']['mutation_reason'] = "error_rate_critical_{$errorRate}";
            $mutated = true;
        }

        // ── UPGRADE: consistently good health → upgrade profile
        if ($health > 90 && $samples >= 5 && $errorRate < 0.05 && $currentIdx > 0) {
            $newIdx = max(0, $currentIdx - 1);
            $state['content_profile']['level'] = $this->profileOrder[$newIdx];
            $state['content_profile']['mutation_reason'] = "health_excellent_{$health}";
            $mutated = true;
        }

        // ── STALL FIX: high stall rate → increase prefetch
        $avgStalls = (float)($telemetry['avg_stalls'] ?? 0);
        if ($avgStalls > 2.0) {
            $state['resilience_config']['prefetch_segments'] = max(
                (int)($state['resilience_config']['prefetch_segments'] ?? 3),
                6
            );
            $state['resilience_config']['prefetch_parallel'] = max(
                (int)($state['resilience_config']['prefetch_parallel'] ?? 2),
                4
            );
            $state['content_profile']['mutation_reason'] = ($state['content_profile']['mutation_reason'] ?? '') . '+stall_fix';
            $mutated = true;
        }

        if ($mutated) {
            $state['content_profile']['mutated'] = true;
            $state['content_profile']['original_level'] = $this->profileOrder[$currentIdx];
            $this->setCooldown($channelId);
        }

        return $state;
    }

    private function isInCooldown(string $channelId): bool
    {
        $file = $this->cooldownPath . '/' . md5($channelId) . '.cd';
        if (!file_exists($file)) return false;
        $lastMutation = (int)@file_get_contents($file);
        return (time() - $lastMutation) < $this->cooldownSeconds;
    }

    private function setCooldown(string $channelId): void
    {
        $file = $this->cooldownPath . '/' . md5($channelId) . '.cd';
        @file_put_contents($file, (string)time(), LOCK_EX);
    }
}
