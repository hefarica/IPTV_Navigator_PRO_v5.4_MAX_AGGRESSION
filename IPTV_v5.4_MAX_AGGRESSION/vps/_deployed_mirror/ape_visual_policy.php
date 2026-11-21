<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-APE-Metadata-Only: true');
header('X-APE-No-Reencode: true');
header('X-APE-Single-Session: true');
function ape_param($key, $default='unknown') { return isset($_GET[$key]) ? preg_replace('/[^A-Za-z0-9_.:-]/', '_', substr($_GET[$key], 0, 96)) : $default; }
$policy = [
  'version' => 'APE-V3.2.1-post-zap-ultra-php-hevc-first',
  'metadata_only' => true,
  'single_session' => true,
  'no_reencode' => true,
  'no_transcode' => true,
  'no_second_signal' => true,
  'execution_target' => 'device_player_tv',
  'channel_id' => ape_param('channel_id'),
  'profile' => ape_param('profile', 'auto'),
  'hevc_first' => [
    'enabled' => true,
    'prefer' => 'hevc_main10_hardware_decode_if_supported',
    'do_not_force_if_unsupported' => true,
    'do_not_open_second_signal' => true,
    'fallback' => 'best_stable_decodable_variant'
  ],
  'safety' => [
    'do_not_fake_hdr' => true,
    'do_not_fake_4k' => true,
    'do_not_fake_8k' => true,
    'preserve_logos_text' => true
  ]
];
echo json_encode($policy, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
?>
