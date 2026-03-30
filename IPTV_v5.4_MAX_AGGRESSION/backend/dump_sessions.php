<?php
error_reporting(0);
$channelId = '893918';
$docRoot = '/var/www/html';

// Find ALL M3U8 files
$files = glob($docRoot . '/*.m3u8');
echo "M3U8 FILES: " . count($files) . PHP_EOL;
foreach ($files as $f) echo "  " . basename($f) . PHP_EOL;

echo PHP_EOL . "=== SEARCH 1: tvg-id=\"893918\" ===" . PHP_EOL;
foreach ($files as $f) {
    $cmd = "fgrep -m1 'tvg-id=\"$channelId\"' " . escapeshellarg($f) . " 2>/dev/null";
    $r = trim(shell_exec($cmd) ?? '');
    if ($r) echo basename($f) . ": " . substr($r, 0, 250) . PHP_EOL;
}

echo PHP_EOL . "=== SEARCH 2: /893918.m3u8 URL line + EXTINF above ===" . PHP_EOL;
foreach ($files as $f) {
    $cmd = "fgrep -m1 -B3 '/$channelId.m3u8' " . escapeshellarg($f) . " 2>/dev/null | grep '#EXTINF'";
    $r = trim(shell_exec($cmd) ?? '');
    if ($r) echo basename($f) . ": " . substr($r, 0, 250) . PHP_EOL;
}

echo PHP_EOL . "=== SEARCH 3: ch=893918 in resolve URLs ===" . PHP_EOL;
foreach ($files as $f) {
    $cmd = "fgrep -m1 -B3 'ch=$channelId' " . escapeshellarg($f) . " 2>/dev/null | grep '#EXTINF'";
    $r = trim(shell_exec($cmd) ?? '');
    if ($r) echo basename($f) . ": " . substr($r, 0, 250) . PHP_EOL;
}

echo PHP_EOL . "=== SEARCH 4: Direct URL line with 893918 ===" . PHP_EOL;
foreach ($files as $f) {
    $cmd = "fgrep -m1 '/$channelId.' " . escapeshellarg($f) . " 2>/dev/null";
    $r = trim(shell_exec($cmd) ?? '');
    if ($r) echo basename($f) . ": " . substr($r, 0, 250) . PHP_EOL;
}
