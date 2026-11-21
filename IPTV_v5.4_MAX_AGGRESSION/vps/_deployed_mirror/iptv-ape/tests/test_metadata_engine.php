<?php
declare(strict_types=1);

/**
 * FASE 5: MetadataEngine Unit Tests
 * Version: 1.0 — 12 test scenarios
 * Run: php tests/test_metadata_engine.php
 */

require_once __DIR__ . '/../ape_metadata_engine.php';

$passed = 0;
$failed = 0;
$total  = 0;

function assert_eq($label, $expected, $actual) {
    global $passed, $failed, $total;
    $total++;
    if ($expected === $actual) {
        $passed++;
        echo "  ✅ {$label}\n";
    } else {
        $failed++;
        echo "  ❌ {$label}: expected " . var_export($expected, true) . ", got " . var_export($actual, true) . "\n";
    }
}

function assert_true($label, $condition) {
    global $passed, $failed, $total;
    $total++;
    if ($condition) {
        $passed++;
        echo "  ✅ {$label}\n";
    } else {
        $failed++;
        echo "  ❌ {$label}: condition was false\n";
    }
}

echo "═══════════════════════════════════════════════\n";
echo " FASE 5: MetadataEngine Unit Tests\n";
echo "═══════════════════════════════════════════════\n\n";

$engine = new MetadataEngine();

// ── TEST 1: parseMasterPlaylist ──
echo "TEST 1: parseMasterPlaylist\n";
$masterM3U8 = <<<M3U
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="avc1.64001f,mp4a.40.2",FRAME-RATE=50.000
http://example.com/hd.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
http://example.com/sd.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160,CODECS="hev1.1.6.L150,mp4a.40.2",FRAME-RATE=60.000
http://example.com/4k.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Spanish",LANGUAGE="es"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en"
M3U;
$parsed = $engine->parseMasterPlaylist($masterM3U8);
assert_eq('playlist_type is master', 'master', $parsed['playlist_type']);
assert_eq('3 variants detected', 3, count($parsed['variants']));
assert_eq('2 audio tracks', 2, $parsed['audio_tracks_count']);
assert_eq('1 subtitle track', 1, $parsed['subtitle_tracks_count']);

// ── TEST 2: classifyByBitrate ──
echo "\nTEST 2: classifyByBitrate\n";
assert_eq('8K threshold', '8K', $engine->classifyByBitrate(30000000));
assert_eq('4K threshold', '4K', $engine->classifyByBitrate(15000000));
assert_eq('FHD threshold', 'FHD', $engine->classifyByBitrate(6000000));
assert_eq('HD threshold', 'HD', $engine->classifyByBitrate(3000000));
assert_eq('SD threshold', 'SD', $engine->classifyByBitrate(1000000));
assert_eq('LD threshold', 'LD', $engine->classifyByBitrate(500000));
assert_eq('unknown for 0', 'unknown', $engine->classifyByBitrate(0));

// ── TEST 3: classifyContentType ──
echo "\nTEST 3: classifyContentType (8 scenarios)\n";
$sports = $engine->classifyContentType(['fps' => 60, 'bandwidth' => 10000000, 'channel_name' => 'ESPN 4K']);
assert_eq('Sports detected via keyword+signals', 'DEPORTES', $sports['type']);
assert_true('Sports confidence > 0', $sports['confidence'] > 0);

$cinema = $engine->classifyContentType(['audio_channels' => 6, 'bandwidth' => 5000000, 'channel_name' => 'HBO Cine']);
assert_eq('Cinema detected', 'CINE', $cinema['type']);

$news = $engine->classifyContentType(['bandwidth' => 2000000, 'duration' => 10000, 'channel_name' => 'CNN News 24h']);
assert_eq('News detected', 'NOTICIAS', $news['type']);

$kids = $engine->classifyContentType(['channel_name' => 'Disney Junior Kids']);
assert_eq('Kids detected', 'INFANTIL', $kids['type']);

$music = $engine->classifyContentType(['audio_channels' => 2, 'bandwidth' => 1500000, 'channel_name' => 'MTV Hits']);
assert_eq('Music detected', 'MÚSICA', $music['type']);

$religious = $engine->classifyContentType(['channel_name' => 'Canal Iglesia Católica']);
assert_eq('Religious detected', 'RELIGIOSO', $religious['type']);

$general = $engine->classifyContentType(['bandwidth' => 4000000, 'channel_name' => 'XYZ Premium HD']);
assert_eq('General fallback', 'GENERAL', $general['type']);

$f1 = $engine->classifyContentType(['fps' => 60, 'bandwidth' => 12000000, 'channel_name' => 'Sky Sports F1 4K']);
assert_eq('F1 is DEPORTES', 'DEPORTES', $f1['type']);

// ── TEST 4: detectHDR ──
echo "\nTEST 4: detectHDR\n";
$hdr10 = $engine->detectHDR(['codecs' => 'hev1.2.4.L153.B0.hdr10']);
assert_eq('HDR10 detected', 'hdr10', $hdr10['hdr_type']);
$dv = $engine->detectHDR(['codecs' => 'dvhe.08.07']);
assert_eq('Dolby Vision detected', 'dolby_vision', $dv['hdr_type']);
$sdr = $engine->detectHDR(['codecs' => 'avc1.64001f']);
assert_eq('No HDR', 'none', $sdr['hdr_type']);

// ── TEST 5: calculateMetadataScore ──
echo "\nTEST 5: calculateMetadataScore\n";
$premium = $engine->calculateMetadataScore([
    'width' => 3840, 'height' => 2160, 'bandwidth' => 15000000,
    'codecs' => 'hev1.1.6.L150', 'fps' => 60,
]);
assert_true('Premium score >= 0.7', $premium['total'] >= 0.7);
assert_eq('Premium grade A, B, or S', true, in_array($premium['grade'], ['A', 'B', 'S']));

$low = $engine->calculateMetadataScore([
    'width' => 640, 'height' => 480, 'bandwidth' => 800000,
    'codecs' => 'avc1.42001e', 'fps' => 25,
]);
assert_true('Low score < 0.5', $low['total'] < 0.5);

// ── TEST 6: generateStreamFingerprint ──
echo "\nTEST 6: generateStreamFingerprint\n";
$fp1 = $engine->generateStreamFingerprint(['bandwidth' => 6000000, 'resolution' => '1920x1080', 'codecs' => 'avc1.64001f', 'audio_channels' => 2, 'origin_server' => 'cdn1.example.com']);
$fp2 = $engine->generateStreamFingerprint(['bandwidth' => 6000000, 'resolution' => '1920x1080', 'codecs' => 'avc1.64001f', 'audio_channels' => 2, 'origin_server' => 'cdn1.example.com']);
$fp3 = $engine->generateStreamFingerprint(['bandwidth' => 12000000, 'resolution' => '3840x2160', 'codecs' => 'hev1.1.6.L150', 'audio_channels' => 6, 'origin_server' => 'cdn2.example.com']);
assert_eq('Same stream = same hash', $fp1, $fp2);
assert_true('Different stream = different hash', $fp1 !== $fp3);

// ── TEST 7: estimateStability ──
echo "\nTEST 7: estimateStability\n";
$vodStable = $engine->estimateStability(['segment_count' => 200, 'has_endlist' => true, 'discontinuity_count' => 0, 'segment_durations' => array_fill(0, 200, 6.0)]);
assert_true('VOD stable score > 0.9', $vodStable['score'] > 0.9);
assert_eq('VOD detected', 'VOD', $vodStable['stream_type']);

$liveUnstable = $engine->estimateStability(['segment_count' => 2, 'has_endlist' => false, 'discontinuity_count' => 10]);
assert_true('Live unstable score <= 0.7', $liveUnstable['score'] <= 0.7);
assert_eq('LIVE detected', 'LIVE', $liveUnstable['stream_type']);

// ── TEST 8: detectLiveVsVOD ──
echo "\nTEST 8: detectLiveVsVOD\n";
assert_eq('VOD with endlist', 'VOD', $engine->detectLiveVsVOD(['has_endlist' => true, 'segment_count' => 100]));
assert_eq('LIVE without endlist', 'LIVE', $engine->detectLiveVsVOD(['has_endlist' => false, 'segment_count' => 5]));
assert_eq('UNKNOWN with no segments', 'UNKNOWN', $engine->detectLiveVsVOD(['has_endlist' => false, 'segment_count' => 0]));

// ── TEST 9: classifyByCodec ──
echo "\nTEST 9: classifyByCodec\n";
$av1 = $engine->classifyByCodec('av01.0.08M.08');
assert_eq('AV1 primary codec', 'av1', $av1['primary_codec']);
assert_eq('AV1 score 100', 100, $av1['codec_quality_score']);
$hevc = $engine->classifyByCodec('hev1.1.6.L150,mp4a.40.2');
assert_eq('HEVC primary codec', 'hevc', $hevc['primary_codec']);
assert_eq('HEVC score 90', 90, $hevc['codec_quality_score']);
$h264 = $engine->classifyByCodec('avc1.64001f,mp4a.40.2');
assert_eq('H264 primary codec', 'h264', $h264['primary_codec']);

// ── TEST 10: classifyByFPS ──
echo "\nTEST 10: classifyByFPS\n";
assert_eq('60fps = high_motion', 'high_motion', $engine->classifyByFPS(60.0));
assert_eq('30fps = standard', 'standard', $engine->classifyByFPS(30.0));
assert_eq('24fps = cinema', 'cinema', $engine->classifyByFPS(24.0));

// ── TEST 11: enrichQosRef ──
echo "\nTEST 11: enrichQosRef\n";
$qos = ['profile' => 'P3', 'ch' => '14'];
$enriched = $engine->enrichQosRef($qos, [
    'score' => ['total' => 0.85, 'breakdown' => ['bitrate_score' => 0.6]],
    'parsed' => ['resolution' => '1920x1080', 'codecs' => 'hev1.1.6.L150', 'fps' => 50],
    'classification' => ['type' => 'DEPORTES', 'confidence' => 0.92],
    'stream_type' => 'LIVE',
    'fingerprint' => 'abc123',
]);
assert_eq('verified_resolution populated', '1920x1080', $enriched['verified_resolution']);
assert_eq('content_type_auto populated', 'DEPORTES', $enriched['content_type_auto']);
assert_eq('metadata_score populated', 0.85, $enriched['metadata_score']);
assert_eq('stream_type_detected populated', 'LIVE', $enriched['stream_type_detected']);
assert_eq('duplicate_group populated', 'abc123', $enriched['duplicate_group']);

// ── TEST 12: extractStreamInfAttributes ──
echo "\nTEST 12: extractStreamInfAttributes\n";
$attrs = $engine->extractStreamInfAttributes($parsed); // from TEST 1 master playlist
assert_eq('Best bandwidth is 12000000', 12000000, $attrs['bandwidth']);
assert_eq('Best resolution is 3840x2160', '3840x2160', $attrs['resolution']);
assert_true('Codecs contain hev1', str_contains($attrs['codecs'], 'hev1'));
assert_eq('FPS is 60', 60.0, $attrs['fps']);

// ── RESULTS ──
echo "\n═══════════════════════════════════════════════\n";
echo " RESULTS: {$passed}/{$total} passed, {$failed} failed\n";
echo "═══════════════════════════════════════════════\n";
exit($failed > 0 ? 1 : 0);
