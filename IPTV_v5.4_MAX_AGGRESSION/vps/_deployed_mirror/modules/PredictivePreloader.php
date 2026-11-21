<?php
/**
 * PredictivePreloader v3.0
 *
 * Tracks channel viewing sequences per session and predicts the next channel
 * the user will watch. Generates preload hint directives so the player can
 * start buffering the likely next channel in advance.
 *
 * Uses Markov-chain-like frequency counting: for each (session, channel_A),
 * track which channel_B was watched next. The most frequent transition wins.
 *
 * Anti-509: This module NEVER requests provider URLs. It only generates hints.
 * The player decides whether to act on them.
 */
class PredictivePreloader
{
    private string $storagePath;
    private int $maxSessionAge = 7200;    // 2h session window
    private int $maxTransitions = 500;    // max stored transitions

    public function __construct(string $storageDirPath)
    {
        $this->storagePath = rtrim($storageDirPath, '/');
        if (!is_dir($this->storagePath)) {
            @mkdir($this->storagePath, 0755, true);
        }
    }

    /**
     * Record that the user viewed a channel in this session.
     */
    public function recordChannelView(string $sessionId, string $channelId, string $groupTitle = ''): void
    {
        if (empty($sessionId) || empty($channelId)) return;

        $file = $this->getSessionFile($sessionId);
        $data = $this->loadFile($file);

        $now = time();

        // If session is too old, reset
        if (($now - ($data['started_at'] ?? $now)) > $this->maxSessionAge) {
            $data = ['started_at' => $now, 'views' => [], 'transitions' => []];
        }

        if (!isset($data['started_at'])) {
            $data['started_at'] = $now;
        }

        // Record transition from previous channel
        $lastView = end($data['views']);
        if ($lastView !== false && ($lastView['channel'] ?? '') !== $channelId) {
            $fromCh = $lastView['channel'];
            $key = $fromCh . '→' . $channelId;
            $data['transitions'][$key] = ($data['transitions'][$key] ?? 0) + 1;

            // Trim transitions if too many
            if (count($data['transitions']) > $this->maxTransitions) {
                arsort($data['transitions']);
                $data['transitions'] = array_slice($data['transitions'], 0, $this->maxTransitions, true);
            }
        }

        // Record view
        $data['views'][] = [
            'channel'     => $channelId,
            'group_title' => $groupTitle,
            'timestamp'   => $now,
        ];

        // Keep only last 100 views
        if (count($data['views']) > 100) {
            $data['views'] = array_slice($data['views'], -100);
        }

        $this->saveFile($file, $data);

        // Also update global transition matrix
        $this->updateGlobalTransitions($lastView['channel'] ?? '', $channelId);
    }

    /**
     * Predict the next channel based on session history and global patterns.
     */
    public function predictNextChannel(string $sessionId, string $channelId): array
    {
        // 1. Check session-specific patterns
        $file = $this->getSessionFile($sessionId);
        $data = $this->loadFile($file);

        $candidates = [];

        // Find transitions from current channel in this session
        foreach ($data['transitions'] ?? [] as $key => $count) {
            $parts = explode('→', $key);
            if (count($parts) === 2 && $parts[0] === $channelId) {
                $candidates[$parts[1]] = ($candidates[$parts[1]] ?? 0) + $count * 3; // Session weight x3
            }
        }

        // 2. Check global transition patterns
        $globalFile = $this->storagePath . '/global_transitions.json';
        $global = $this->loadFile($globalFile);
        foreach ($global['transitions'] ?? [] as $key => $count) {
            $parts = explode('→', $key);
            if (count($parts) === 2 && $parts[0] === $channelId) {
                $candidates[$parts[1]] = ($candidates[$parts[1]] ?? 0) + $count; // Global weight x1
            }
        }

        if (empty($candidates)) {
            return ['confidence' => 0, 'predicted_channel' => ''];
        }

        // Sort by score descending
        arsort($candidates);
        $bestChannel = array_key_first($candidates);
        $bestScore   = $candidates[$bestChannel];
        $totalScore  = array_sum($candidates);

        $confidence = $totalScore > 0 ? $bestScore / $totalScore : 0;

        return [
            'predicted_channel' => $bestChannel,
            'confidence'        => round($confidence, 3),
            'total_candidates'  => count($candidates),
            'score'             => $bestScore,
        ];
    }

    /**
     * Generate preload hint directives for the player.
     */
    public function generatePreloadDirectives(array $prediction, string $playerType): array
    {
        $confidence = (float)($prediction['confidence'] ?? 0);
        $predicted  = $prediction['predicted_channel'] ?? '';

        if ($confidence < 0.5 || empty($predicted)) {
            return [];
        }

        $directives = [
            'X-RQ-Preload-Hint' => 'true',
            'X-RQ-Preload-Channel' => $predicted,
            'X-RQ-Preload-Confidence' => (string)round($confidence * 100) . '%',
        ];

        // Stronger preload for high confidence
        if ($confidence >= 0.8) {
            $directives['X-RQ-Preload-Strategy'] = 'aggressive';
            $directives['X-RQ-Preload-Segments'] = '3';
        } elseif ($confidence >= 0.6) {
            $directives['X-RQ-Preload-Strategy'] = 'moderate';
            $directives['X-RQ-Preload-Segments'] = '1';
        } else {
            $directives['X-RQ-Preload-Strategy'] = 'hint-only';
            $directives['X-RQ-Preload-Segments'] = '0';
        }

        return $directives;
    }

    /**
     * Update global transition matrix (cross-session learning).
     */
    private function updateGlobalTransitions(string $fromChannel, string $toChannel): void
    {
        if (empty($fromChannel) || empty($toChannel)) return;

        $file = $this->storagePath . '/global_transitions.json';
        $data = $this->loadFile($file);

        $key = $fromChannel . '→' . $toChannel;
        $data['transitions'][$key] = ($data['transitions'][$key] ?? 0) + 1;
        $data['last_updated'] = time();

        // Trim if too large
        if (count($data['transitions'] ?? []) > 2000) {
            arsort($data['transitions']);
            $data['transitions'] = array_slice($data['transitions'], 0, 1000, true);
        }

        $this->saveFile($file, $data);
    }

    private function getSessionFile(string $sessionId): string
    {
        return $this->storagePath . '/session_' . md5($sessionId) . '.json';
    }

    private function loadFile(string $file): array
    {
        if (!file_exists($file)) {
            return [];
        }
        $raw = @file_get_contents($file);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function saveFile(string $file, array $data): void
    {
        @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}
