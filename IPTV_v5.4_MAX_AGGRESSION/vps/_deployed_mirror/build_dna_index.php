<?php
/**
 * 🧬 APE v18.9: Build Compact DNA Index
 * 
 * Loads the full 142MB channels_map.json once (CLI, not web) and creates 
 * a compact per-channel DNA index in /dev/shm for O(1) web lookups.
 * 
 * Run with: php /var/www/html/build_dna_index.php
 * (cron every 5 min or on list upload)
 */

ini_set('memory_limit', '1024M');

$srcPath = '/var/www/lists/channels_map.json';
$dstPath = '/dev/shm/ape_dna_index.json';

if (!file_exists($srcPath)) {
    fwrite(STDERR, "ERROR: $srcPath not found\n");
    exit(1);
}

echo "Loading $srcPath (" . round(filesize($srcPath)/1024/1024, 1) . " MB)...\n";
$raw = @file_get_contents($srcPath);
if (!$raw) {
    fwrite(STDERR, "ERROR: Failed to read $srcPath\n");
    exit(1);
}

$json = json_decode($raw, true);
unset($raw); // Free memory immediately
if (!$json) {
    fwrite(STDERR, "ERROR: Failed to decode JSON\n");
    exit(1);
}

$channelMap = $json['channelMap'] ?? $json;
$providers = $json['providers'] ?? [];
$meta = $json['meta'] ?? [];

echo "Channels: " . count($channelMap) . "\n";
echo "Providers: " . count($providers) . "\n";

// Build compact index: stream_id → full DNA (only the DNA fields needed by worker)
$compactIndex = [
    'meta' => $meta,
    'providers' => $providers,
    'byStreamId' => [],
    'bySlug' => []
];

foreach ($channelMap as $slug => $entry) {
    if (!is_array($entry)) continue;
    
    $sid = (string)($entry['stream_id'] ?? '');
    
    // Only keep the DNA fields the worker actually needs
    $dna = [
        'profile'               => $entry['profile'] ?? 'P3',
        'stream_id'             => $sid,
        'codec_priority'        => $entry['codec_priority'] ?? 'hevc',
        'manifest_preference'   => $entry['manifest_preference'] ?? ['hls_ts'],
        'fmp4_enabled'          => $entry['fmp4_enabled'] ?? false,
        'math_telemetry'        => $entry['math_telemetry'] ?? [],
        'qoe_qos_metrics'       => $entry['qoe_qos_metrics'] ?? [],
        'security_evasion'      => $entry['security_evasion'] ?? [],
        'dna_profile_overrides' => $entry['dna_profile_overrides'] ?? [],
        'vlcopt_overrides'      => $entry['vlcopt_overrides'] ?? [],
        'http_headers_overrides'=> $entry['http_headers_overrides'] ?? [],
        'kodiprop_overrides'    => $entry['kodiprop_overrides'] ?? [],
        'fusion_directives'     => $entry['fusion_directives'] ?? [],
        'quantum_pixel_overdrive'=> $entry['quantum_pixel_overdrive'] ?? [],
        'telchemy_metrics'      => $entry['telchemy_metrics'] ?? [],
        'hw_tcp_orchestration'  => $entry['hw_tcp_orchestration'] ?? [],
    ];
    
    // Index by stream_id (for numeric ID lookups)
    if ($sid !== '') {
        $compactIndex['byStreamId'][$sid] = $dna;
    }
    // Index by slug (for direct key lookups)
    $compactIndex['bySlug'][$slug] = $dna;
}

unset($channelMap, $json); // Free memory

$output = json_encode($compactIndex, JSON_UNESCAPED_SLASHES);
$bytesWritten = file_put_contents($dstPath, $output);

echo "Written: $dstPath (" . round($bytesWritten/1024/1024, 1) . " MB)\n";
echo "Stream IDs indexed: " . count($compactIndex['byStreamId']) . "\n";
echo "Slugs indexed: " . count($compactIndex['bySlug']) . "\n";
echo "Done!\n";
