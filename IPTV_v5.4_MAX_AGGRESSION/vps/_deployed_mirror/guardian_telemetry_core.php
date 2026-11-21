<?php

declare(strict_types=1);

/**
 * 🏎️ GUARDIAN ENGINE CORE: F1-Grade UDP Telemetry Daemon
 * Listens on UDP port 8125 for FFmpeg progress metrics.
 * Non-blocking, Fire-and-Forget architecture for zero-delay stream monitoring.
 * Outputs consolidated state to RAM-Disk: /dev/shm/ape_guardian/live_telemetry_global.json
 */

$udpHost = '127.0.0.1';
$udpPort = 8125;
$ramDiskOutput = '/dev/shm/ape_guardian/live_telemetry_global.json';

if (!is_dir(dirname($ramDiskOutput))) {
    @mkdir(dirname($ramDiskOutput), 0777, true);
}

// Global Memory State
$globalState = [];

// Create UDP Socket
$socket = socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
if (!$socket) {
    die("Error: Failed to create UDP socket.\n");
}

if (!socket_bind($socket, $udpHost, $udpPort)) {
    die("Error: Failed to bind to UDP $udpHost:$udpPort. Port already in use?\n");
}

echo "[guardian_telemetry_core] Listening on UDP $udpHost:$udpPort...\n";

// FFmpeg format parsing state for partial UDP packets
$packetBuffer = [];

$lastFlushTime = microtime(true);
$flushInterval = 0.5; // Flush to disk every 500ms even if no packets received to handle dead streams

while (true) {
    $read = [$socket];
    $write = null;
    $except = null;

    // Select with 100ms timeout
    $numChanged = socket_select($read, $write, $except, 0, 100000);

    if ($numChanged > 0) {
        $data = '';
        $from = '';
        $port = 0;
        socket_recvfrom($socket, $data, 2048, 0, $from, $port);

        // Parse custom F1 Telemetry JSON emitted by cmaf_worker.php (socket_sendto)
        $payload = @json_decode(trim($data), true);

        if ($payload && isset($payload['list_id']) && isset($payload['channel_id'])) {
            $listId = $payload['list_id'];
            $channelId = $payload['channel_id'];

            // Re-hydrate array layers if not exist
            if (!isset($globalState[$listId])) {
                $globalState[$listId] = [];
            }
            if (!isset($globalState[$listId][$channelId])) {
                $globalState[$listId][$channelId] = [
                    'micro_freezes' => 0
                ];
            }

            $speedKbps = (float)($payload['speed_kbps'] ?? 0);
            $bitrateKbps = (float)($payload['bitrate_kbps'] ?? 5000);

            $status = ($speedKbps > 0) ? 'LIVE' : 'BUFFERING';

            $microFreezes = (int)($payload['micro_freezes'] ?? 0);
            $healthScore = (float)($payload['health_score'] ?? 100);

            // 🧬 SESSION MUTATION KERNEL v1.0
            $mutationPlan = [
                'bandwidth_state' => 'BALANCED',
                'freeze_state'    => 'CLEAN',
                'protocol_hint'   => 'KEEP',
                'buffer_hint'     => ['target_ms' => 0, 'netcache_ms' => 0],
                'abr_hint'        => ['max_kbps' => $bitrateKbps, 'min_kbps' => $bitrateKbps * 0.5],
                'action'          => 'MAINTAIN_PERFECTION'
            ];

            // Evaluate Freeze State
            if ($microFreezes > 3 || $healthScore < 60) {
                $mutationPlan['freeze_state'] = 'CRITICAL';
            } elseif ($microFreezes > 0) {
                $mutationPlan['freeze_state'] = 'INTERMITTENT';
            }

            // Engine Decision Tree
            if ($speedKbps >= 1.1 * $bitrateKbps && $microFreezes === 0) {
                $mutationPlan['bandwidth_state'] = 'OVERPROVISIONED';
                $mutationPlan['action'] = 'MAINTAIN_PERFECTION';
            } elseif ($speedKbps >= 0.8 * $bitrateKbps && $speedKbps <= 1.0 * $bitrateKbps && $microFreezes > 0) {
                $mutationPlan['bandwidth_state'] = 'STARVING';
                $mutationPlan['action'] = 'QUANTUM_MUTATION_STRANGLE';
                $mutationPlan['buffer_hint']['target_ms'] += 5000;
                $mutationPlan['abr_hint']['max_kbps'] = max(500, $bitrateKbps * 0.9);
            } elseif ($speedKbps < 0.6 * $bitrateKbps || $healthScore < 50) {
                $mutationPlan['bandwidth_state'] = 'STARVING';
                $mutationPlan['action'] = 'EMERGENCY_CDN_FAILOVER';
                $mutationPlan['protocol_hint'] = 'DOWNGRADE_HLS';
            }

            // Persist the incoming state into the global dictionary
            $globalState[$listId][$channelId]['status'] = $status;
            $globalState[$listId][$channelId]['codec'] = $payload['codec'] ?? 'UNKNOWN';
            $globalState[$listId][$channelId]['bitrate_kbps'] = $bitrateKbps;
            $globalState[$listId][$channelId]['speed_kbps'] = $speedKbps;
            $globalState[$listId][$channelId]['speed'] = round($speedKbps / max(1, $bitrateKbps), 2);
            $globalState[$listId][$channelId]['health_score'] = $healthScore;

            // Accumulate freezes (worker resets them every 100ms, but we can track total here if we want)
            // or just store the active snapshot. We'll store active interval freezes.
            $globalState[$listId][$channelId]['micro_freezes'] = $microFreezes;
            $globalState[$listId][$channelId]['mutation_plan'] = $mutationPlan;

            $globalState[$listId][$channelId]['strangle_ratio'] = (float)($payload['strangle_ratio'] ?? 1.0);
            $globalState[$listId][$channelId]['last_update_ms'] = (int)(microtime(true) * 1000);
        }
    }

    // Flush to RAM Disk every $flushInterval seconds
    $now = microtime(true);
    if ($now - $lastFlushTime >= $flushInterval) {
        // Clean up dead streams (no update in 10 seconds)
        $cutoff = (int)(($now - 10) * 1000);
        foreach ($globalState as $lId => &$channels) {
            foreach ($channels as $cId => $cData) {
                if ($cData['last_update_ms'] < $cutoff) {
                    unset($channels[$cId]);
                }
            }
            if (empty($channels)) {
                unset($globalState[$lId]);
            }
        }

        $json = json_encode($globalState, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        // Write atomically
        $tmpFile = $ramDiskOutput . '.' . uniqid();
        @file_put_contents($tmpFile, $json);
        @rename($tmpFile, $ramDiskOutput);

        $lastFlushTime = $now;
    }
}
