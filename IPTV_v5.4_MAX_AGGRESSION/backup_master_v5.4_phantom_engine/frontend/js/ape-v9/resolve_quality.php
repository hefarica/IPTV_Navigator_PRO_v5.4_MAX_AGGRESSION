<?php
declare(strict_types=1);

/**
 * IPTV Support Cortex - Quality Resolution Engine
 * Version: 1.0.0
 * PHP Version: 8.3+
 * 
 * Motor de decisión determinista para calidad visual en streaming OTT
 * Arquitectura basada en arrays normalizados e idempotentes
 */

namespace IPTVQualityEngine;

use InvalidArgumentException;
use RuntimeException;

final class ResolveQuality
{
    private const VERSION = '1.0.0';
    private const MAX_ITERATIONS = 100;
    private const SUPPORTED_CODECS = ['hevc', 'h265', 'avc', 'h264', 'av1', 'vp9'];
    private const SUPPORTED_TRANSPORTS = ['ts', 'fmp4', 'cmaf', 'dash', 'mpd'];
    private const HDR_TYPES = ['hdr10', 'hdr10plus', 'dolbyvision', 'hlg'];
    
    private array $config = [];
    private array $channelsMap = [];
    private array $manifestCache = [];
    private string $channelsMapPath;

    public function __construct(string $channelsMapPath = '')
    {
        $this->channelsMapPath = $channelsMapPath;
        $this->initializeConfig();
        $this->loadChannelsMap();
    }

    private function initializeConfig(): void
    {
        $this->config = [
            'version' => self::VERSION,
            'debug' => false,
            'cache_enabled' => true,
            'max_bitrate_variance' => 0.15,
            'min_stable_bitrate_ratio' => 0.7,
            'abr_safety_margin' => 0.2,
            'hdr_tone_mapping' => [
                'hdr10_to_sdr' => 'hable',
                'hdr10plus_to_sdr' => 'reinhard',
                'dolbyvision_to_sdr' => 'mobius',
            ],
            'codec_priority' => [
                'hevc' => 100,
                'h265' => 100,
                'av1' => 95,
                'vp9' => 85,
                'avc' => 70,
                'h264' => 70,
            ],
            'resolution_priority' => [
                '4k' => 2160,
                'uhd' => 2160,
                'fhd' => 1080,
                'hd' => 720,
                'sd' => 480,
            ],
            'deinterlace_modes' => [
                'bwdif' => ['quality' => 95, 'performance' => 80],
                'yadif' => ['quality' => 80, 'performance' => 90],
                'w3fdif' => ['quality' => 85, 'performance' => 85],
            ],
        ];
    }

    private function loadChannelsMap(): void
    {
        if ($this->channelsMapPath && file_exists($this->channelsMapPath)) {
            $content = file_get_contents($this->channelsMapPath);
            if ($content !== false) {
                $this->channelsMap = json_decode($content, true) ?? [];
            }
        }
        
        if (empty($this->channelsMap)) {
            $this->channelsMap = $this->getDefaultChannelsMap();
        }
    }

    private function getDefaultChannelsMap(): array
    {
        return [
            'schema_version' => '1.0.0',
            'generated_at' => date('c'),
            'channels' => [],
            'global_defaults' => $this->getGlobalDefaults(),
        ];
    }

    private function getGlobalDefaults(): array
    {
        return [
            'codec_profile' => [
                'preferred_codec' => 'hevc',
                'fallback_codec' => 'avc',
                'allow_av1' => true,
                'max_profile' => 'high',
                'max_level' => 51,
            ],
            'transport_profile' => [
                'preferred_transport' => 'cmaf',
                'fallback_transport' => 'ts',
                'allow_fmp4' => true,
                'allow_dash' => false,
            ],
            'hdr_policy' => [
                'passthrough' => true,
                'tone_mapping_method' => 'hable',
                'target_colorspace' => 'bt709',
            ],
            'abr_policy' => [
                'enabled' => true,
                'min_bitrate' => 500000,
                'max_bitrate' => 15000000,
                'start_bitrate' => 2000000,
                'buffer_size_seconds' => 30,
            ],
            'deinterlace_policy' => [
                'auto_detect' => true,
                'preferred_mode' => 'bwdif',
                'force_deinterlace' => false,
            ],
        ];
    }

    // ==================== MAIN ENTRY POINT ====================

    public function resolve(string $manifestUrl, string $channelId = '', array $deviceProfile = [], array $networkProfile = []): array
    {
        $startTime = microtime(true);
        
        $context = $this->initializeResolutionContext($manifestUrl, $channelId, $deviceProfile, $networkProfile);
        
        $context['manifest_facts'] = $this->parseManifest($manifestUrl);
        
        $context['transport_facts'] = $this->analyzeTransport($context['manifest_facts']);
        
        $context['codec_facts'] = $this->analyzeCodecs($context['manifest_facts']);
        
        $context['video_pipeline_facts'] = $this->analyzeVideoPipeline($context['manifest_facts']);
        
        $context = $this->normalizeDirectives($context);
        
        $context = $this->resolveConflicts($context);
        
        $context['quality_decision'] = $this->makeQualityDecision($context);
        
        $context['resolved_output'] = $this->buildResolvedOutput($context);
        
        $context['idempotency_hash'] = $this->generateIdempotencyHash($context);
        
        if ($channelId) {
            $this->updateChannelsMap($channelId, $context);
        }
        
        return $this->formatOutput($context, $startTime);
    }

    private function initializeResolutionContext(string $manifestUrl, string $channelId, array $deviceProfile, array $networkProfile): array
    {
        return [
            'resolution_id' => bin2hex(random_bytes(8)),
            'manifest_url' => $manifestUrl,
            'channel_id' => $channelId,
            'timestamp' => date('c'),
            'device_profile' => array_merge($this->getDefaultDeviceProfile(), $deviceProfile),
            'network_profile' => array_merge($this->getDefaultNetworkProfile(), $networkProfile),
            'player_profile' => $this->getDefaultPlayerProfile(),
            'manifest_facts' => [],
            'transport_facts' => [],
            'codec_facts' => [],
            'video_pipeline_facts' => [],
            'directive_normalization' => [],
            'conflicts_resolved' => [],
            'warnings' => [],
            'quality_decision' => [],
            'resolved_output' => [],
            'decision_trace' => [],
            'safety_fallbacks' => [],
            'compliance_flags' => [],
        ];
    }

    private function getDefaultDeviceProfile(): array
    {
        return [
            'device_type' => 'unknown',
            'screen_resolution' => ['width' => 1920, 'height' => 1080],
            'screen_refresh_rate' => 60,
            'hdr_support' => ['hdr10' => false, 'hdr10plus' => false, 'dolbyvision' => false, 'hlg' => false],
            'codec_support' => [
                'hevc' => ['decode' => true, 'profile' => ['main', 'high']],
                'avc' => ['decode' => true, 'profile' => ['baseline', 'main', 'high']],
                'av1' => ['decode' => false, 'profile' => ['main']],
                'vp9' => ['decode' => true, 'profile' => ['profile0', 'profile2']],
            ],
            'max_bitrate' => 25000000,
            'hardware_decoding' => true,
            'lcevc_support' => false,
        ];
    }

    private function getDefaultNetworkProfile(): array
    {
        return [
            'connection_type' => 'unknown',
            'estimated_bandwidth' => 10000000,
            'latency_ms' => 50,
            'jitter_ms' => 10,
            'packet_loss_rate' => 0.001,
            'stable_bandwidth' => 8000000,
            'bandwidth_variance' => 0.1,
        ];
    }

    private function getDefaultPlayerProfile(): array
    {
        return [
            'player_type' => 'generic',
            'abr_enabled' => true,
            'abr_algorithm' => 'throughput',
            'buffer_target' => 30,
            'buffer_min' => 5,
            'support_hls' => true,
            'support_dash' => false,
            'support_cmaf' => true,
            'support_fmp4' => true,
        ];
    }

    // ==================== M3U8 PARSER ====================

    public function parseManifest(string $manifestUrl): array
    {
        $content = $this->fetchManifest($manifestUrl);
        
        if ($content === false) {
            throw new RuntimeException("Failed to fetch manifest: {$manifestUrl}");
        }
        
        $facts = [
            'source_url' => $manifestUrl,
            'fetched_at' => date('c'),
            'raw_tags' => [],
            'extinf_entries' => [],
            'stream_variants' => [],
            'media_tags' => [],
            'vlcopt_directives' => [],
            'kodiprop_directives' => [],
            'exthttp_directives' => [],
            'extattr_directives' => [],
            'x_map_tags' => [],
            'target_duration' => null,
            'program_date_time' => null,
            'is_master_playlist' => false,
            'is_media_playlist' => false,
            'detected_format' => 'unknown',
            'segment_type' => 'unknown',
        ];
        
        $lines = explode("\n", $content);
        $currentEntry = [];
        $lineCount = count($lines);
        
        for ($i = 0; $i < $lineCount; $i++) {
            $line = trim($lines[$i]);
            
            if (empty($line)) {
                continue;
            }
            
            $tagResult = $this->parseTag($line, $lines, $i, $currentEntry, $facts);
            $facts = $tagResult['facts'];
            $currentEntry = $tagResult['current_entry'];
        }
        
        $facts['is_master_playlist'] = !empty($facts['stream_variants']);
        $facts['is_media_playlist'] = !empty($facts['extinf_entries']) && !$facts['is_master_playlist'];
        $facts['detected_format'] = $this->detectManifestFormat($facts);
        $facts['segment_type'] = $this->detectSegmentType($facts);
        
        return $facts;
    }

    private function fetchManifest(string $url): string|false
    {
        if ($this->config['cache_enabled'] && isset($this->manifestCache[$url])) {
            return $this->manifestCache[$url];
        }
        
        $context = stream_context_create([
            'http' => [
                'timeout' => 10,
                'user_agent' => 'IPTV-Quality-Engine/' . self::VERSION,
                'follow_location' => true,
                'max_redirects' => 3,
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);
        
        $content = @file_get_contents($url, false, $context);
        
        if ($content !== false && $this->config['cache_enabled']) {
            $this->manifestCache[$url] = $content;
        }
        
        return $content;
    }

    private function parseTag(string $line, array $lines, int $index, array $currentEntry, array $facts): array
    {
        if (!str_starts_with($line, '#')) {
            if (!empty($currentEntry)) {
                $currentEntry['url'] = $this->resolveUrl($line, $facts['source_url'] ?? '');
                if (isset($currentEntry['type'])) {
                    if ($currentEntry['type'] === 'stream_variant') {
                        $facts['stream_variants'][] = $currentEntry;
                    } else {
                        $facts['extinf_entries'][] = $currentEntry;
                    }
                }
                $currentEntry = [];
            }
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        $facts['raw_tags'][] = $line;
        
        if ($line === '#EXTM3U') {
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-VERSION:(\d+)$/', $line, $m)) {
            $facts['hls_version'] = (int)$m[1];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)$/', $line, $m)) {
            $facts['target_duration'] = (float)$m[1];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-PROGRAM-DATE-TIME:(.+)$/', $line, $m)) {
            $facts['program_date_time'] = $m[1];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-MAP:(.+)$/', $line, $m)) {
            $mapAttrs = $this->parseAttributes($m[1]);
            $facts['x_map_tags'][] = [
                'raw' => $line,
                'attributes' => $mapAttrs,
                'uri' => $mapAttrs['URI'] ?? null,
                'byte_range' => $mapAttrs['BYTERANGE'] ?? null,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-MEDIA:(.+)$/', $line, $m)) {
            $mediaAttrs = $this->parseAttributes($m[1]);
            $facts['media_tags'][] = [
                'raw' => $line,
                'type' => $mediaAttrs['TYPE'] ?? 'UNKNOWN',
                'group_id' => $mediaAttrs['GROUP-ID'] ?? null,
                'name' => $mediaAttrs['NAME'] ?? null,
                'language' => $mediaAttrs['LANGUAGE'] ?? null,
                'default' => ($mediaAttrs['DEFAULT'] ?? 'NO') === 'YES',
                'attributes' => $mediaAttrs,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-STREAM-INF:(.+)$/', $line, $m)) {
            $streamAttrs = $this->parseAttributes($m[1]);
            $currentEntry = [
                'type' => 'stream_variant',
                'raw' => $line,
                'bandwidth' => isset($streamAttrs['BANDWIDTH']) ? (int)$streamAttrs['BANDWIDTH'] : null,
                'average_bandwidth' => isset($streamAttrs['AVERAGE-BANDWIDTH']) ? (int)$streamAttrs['AVERAGE-BANDWIDTH'] : null,
                'resolution' => $this->parseResolution($streamAttrs['RESOLUTION'] ?? null),
                'frame_rate' => isset($streamAttrs['FRAME-RATE']) ? (float)$streamAttrs['FRAME-RATE'] : null,
                'codecs' => $this->parseCodecsList($streamAttrs['CODECS'] ?? ''),
                'video_range' => $streamAttrs['VIDEO-RANGE'] ?? 'SDR',
                'audio_group' => $streamAttrs['AUDIO'] ?? null,
                'subtitle_group' => $streamAttrs['SUBTITLES'] ?? null,
                'closed_captions' => $streamAttrs['CLOSED-CAPTIONS'] ?? null,
                'attributes' => $streamAttrs,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXTINF:(-?\d+(?:\.\d+)?),?(.*)$/', $line, $m)) {
            $currentEntry = [
                'type' => 'extinf',
                'duration' => (float)$m[1],
                'title' => trim($m[2] ?? ''),
                'raw' => $line,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXTVLCOPT:(.+)$/', $line, $m)) {
            $optParts = explode('=', $m[1], 2);
            $facts['vlcopt_directives'][] = [
                'raw' => $line,
                'key' => $optParts[0] ?? '',
                'value' => $optParts[1] ?? '',
                'normalized' => strtolower($optParts[0] ?? ''),
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#KODIPROP:(.+)$/', $line, $m)) {
            $optParts = explode('=', $m[1], 2);
            $facts['kodiprop_directives'][] = [
                'raw' => $line,
                'key' => $optParts[0] ?? '',
                'value' => $optParts[1] ?? '',
                'normalized' => strtolower($optParts[0] ?? ''),
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXTHTTP:(.+)$/', $line, $m)) {
            $httpData = json_decode($m[1], true);
            $facts['exthttp_directives'][] = [
                'raw' => $line,
                'headers' => $httpData['headers'] ?? [],
                'method' => $httpData['method'] ?? 'GET',
                'data' => $httpData,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXTATTRFROMURL:(.+)$/', $line, $m)) {
            $facts['extattr_directives'][] = [
                'raw' => $line,
                'url' => $m[1],
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-ENDLIST$/', $line)) {
            $facts['is_vod'] = true;
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-PLAYLIST-TYPE:(.+)$/', $line, $m)) {
            $facts['playlist_type'] = strtoupper($m[1]);
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-I-FRAMES-ONLY$/', $line)) {
            $facts['i_frames_only'] = true;
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-DISCONTINUITY$/', $line)) {
            $facts['discontinuity_count'] = ($facts['discontinuity_count'] ?? 0) + 1;
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-KEY:(.+)$/', $line, $m)) {
            $keyAttrs = $this->parseAttributes($m[1]);
            $facts['encryption'] = [
                'method' => $keyAttrs['METHOD'] ?? 'NONE',
                'uri' => $keyAttrs['URI'] ?? null,
                'iv' => $keyAttrs['IV'] ?? null,
                'keyformat' => $keyAttrs['KEYFORMAT'] ?? null,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-SESSION-KEY:(.+)$/', $line, $m)) {
            $sessionKeyAttrs = $this->parseAttributes($m[1]);
            $facts['session_key'] = [
                'method' => $sessionKeyAttrs['METHOD'] ?? 'NONE',
                'uri' => $sessionKeyAttrs['URI'] ?? null,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-START:(.+)$/', $line, $m)) {
            $startAttrs = $this->parseAttributes($m[1]);
            $facts['start_offset'] = [
                'time_offset' => (float)($startAttrs['TIME-OFFSET'] ?? 0),
                'precise' => ($startAttrs['PRECISE'] ?? 'NO') === 'YES',
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        if (preg_match('/^#EXT-X-SERVER-CONTROL:(.+)$/', $line, $m)) {
            $serverControlAttrs = $this->parseAttributes($m[1]);
            $facts['server_control'] = [
                'can_block_reload' => ($serverControlAttrs['CAN-BLOCK-RELOAD'] ?? 'NO') === 'YES',
                'can_skip_until' => isset($serverControlAttrs['CAN-SKIP-UNTIL']) ? (float)$serverControlAttrs['CAN-SKIP-UNTIL'] : null,
                'hold_back' => isset($serverControlAttrs['HOLD-BACK']) ? (float)$serverControlAttrs['HOLD-BACK'] : null,
            ];
            return ['facts' => $facts, 'current_entry' => $currentEntry];
        }
        
        return ['facts' => $facts, 'current_entry' => $currentEntry];
    }

    private function parseAttributes(string $attrString): array
    {
        $attrs = [];
        $pairs = preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $attrString);
        
        foreach ($pairs as $pair) {
            $pair = trim($pair);
            if (empty($pair)) {
                continue;
            }
            
            $eqPos = strpos($pair, '=');
            if ($eqPos === false) {
                $attrs[strtoupper($pair)] = true;
                continue;
            }
            
            $key = strtoupper(substr($pair, 0, $eqPos));
            $value = substr($pair, $eqPos + 1);
            
            $value = trim($value, '"\'');
            $attrs[$key] = $value;
        }
        
        return $attrs;
    }

    private function parseResolution(?string $resolution): ?array
    {
        if (!$resolution) {
            return null;
        }
        
        $parts = explode('x', $resolution);
        if (count($parts) !== 2) {
            return null;
        }
        
        return [
            'width' => (int)$parts[0],
            'height' => (int)$parts[1],
            'label' => $this->getResolutionLabel((int)$parts[1]),
        ];
    }

    private function getResolutionLabel(int $height): string
    {
        return match (true) {
            $height >= 2160 => '4K/UHD',
            $height >= 1440 => '2K/QHD',
            $height >= 1080 => 'FHD',
            $height >= 720 => 'HD',
            $height >= 480 => 'SD',
            default => 'LOW',
        };
    }

    private function parseCodecsList(string $codecs): array
    {
        $result = [
            'video' => [],
            'audio' => [],
            'subtitle' => [],
            'raw' => $codecs,
        ];
        
        if (empty($codecs)) {
            return $result;
        }
        
        $codecList = explode(',', $codecs);
        
        foreach ($codecList as $codec) {
            $codec = strtoupper(trim($codec));
            
            if (preg_match('/^(HVC1|HEVC|DVH1|H265)/i', $codec)) {
                $result['video'][] = [
                    'codec' => 'hevc',
                    'raw' => $codec,
                    'profile' => $this->extractHevcProfile($codec),
                    'level' => $this->extractHevcLevel($codec),
                ];
            } elseif (preg_match('/^(AVC1|H264|VVC1)/i', $codec)) {
                $result['video'][] = [
                    'codec' => 'avc',
                    'raw' => $codec,
                    'profile' => $this->extractAvcProfile($codec),
                    'level' => $this->extractAvcLevel($codec),
                ];
            } elseif (preg_match('/^(AV01|AV1)/i', $codec)) {
                $result['video'][] = [
                    'codec' => 'av1',
                    'raw' => $codec,
                    'profile' => $this->extractAv1Profile($codec),
                    'level' => $this->extractAv1Level($codec),
                ];
            } elseif (preg_match('/^(VP09|VP9)/i', $codec)) {
                $result['video'][] = [
                    'codec' => 'vp9',
                    'raw' => $codec,
                    'profile' => $this->extractVp9Profile($codec),
                ];
            } elseif (preg_match('/^(MP4A|AAC)/i', $codec)) {
                $result['audio'][] = [
                    'codec' => 'aac',
                    'raw' => $codec,
                ];
            } elseif (preg_match('/^(AC-3|EAC3|EC-3)/i', $codec)) {
                $result['audio'][] = [
                    'codec' => 'eac3',
                    'raw' => $codec,
                    'dolby_atmos' => stripos($codec, 'JOC') !== false,
                ];
            } elseif (preg_match('/^(OPUS)/i', $codec)) {
                $result['audio'][] = [
                    'codec' => 'opus',
                    'raw' => $codec,
                ];
            } elseif (preg_match('/^(WVTT|WEBVTT)/i', $codec)) {
                $result['subtitle'][] = [
                    'codec' => 'webvtt',
                    'raw' => $codec,
                ];
            } else {
                $result['unknown'][] = $codec;
            }
        }
        
        return $result;
    }

    private function extractHevcProfile(string $codec): string
    {
        if (preg_match('/\.([A-Z]+)\./i', $codec, $m)) {
            return strtolower($m[1]);
        }
        return 'main';
    }

    private function extractHevcLevel(string $codec): float
    {
        if (preg_match('/\.(\d{2,3})$/i', $codec, $m)) {
            $level = (int)$m[1];
            return $level / 10;
        }
        return 4.0;
    }

    private function extractAvcProfile(string $codec): string
    {
        if (preg_match('/AVC1\.([0-9A-F]{2})/i', $codec, $m)) {
            $profileIdc = hexdec($m[1]);
            return match ($profileIdc) {
                66 => 'baseline',
                77 => 'main',
                100 => 'high',
                default => 'unknown',
            };
        }
        return 'high';
    }

    private function extractAvcLevel(string $codec): float
    {
        if (preg_match('/\.([0-9A-F]{2})$/i', $codec, $m)) {
            return hexdec($m[1]) / 10;
        }
        return 4.0;
    }

    private function extractAv1Profile(string $codec): string
    {
        if (preg_match('/\.(\d)\./i', $codec, $m)) {
            return match ($m[1]) {
                '0' => 'main',
                '1' => 'high',
                '2' => 'professional',
                default => 'main',
            };
        }
        return 'main';
    }

    private function extractAv1Level(string $codec): int
    {
        if (preg_match('/\.(\d{1,2})$/i', $codec, $m)) {
            return (int)$m[1];
        }
        return 5;
    }

    private function extractVp9Profile(string $codec): string
    {
        if (preg_match('/\.(\d{2})\./i', $codec, $m)) {
            return "profile{$m[1]}";
        }
        return 'profile0';
    }

    private function detectManifestFormat(array $facts): string
    {
        if (!empty($facts['x_map_tags'])) {
            return 'cmaf';
        }
        
        $hasFmp4 = false;
        $hasTs = false;
        
        foreach ($facts['extinf_entries'] as $entry) {
            if (isset($entry['url'])) {
                $ext = strtolower(pathinfo(parse_url($entry['url'], PHP_URL_PATH) ?? '', PATH_EXTENSION));
                if ($ext === 'm4s' || $ext === 'mp4') {
                    $hasFmp4 = true;
                } elseif ($ext === 'ts') {
                    $hasTs = true;
                }
            }
        }
        
        foreach ($facts['stream_variants'] as $variant) {
            if (isset($variant['url'])) {
                $ext = strtolower(pathinfo(parse_url($variant['url'], PHP_URL_PATH) ?? '', PATH_EXTENSION));
                if ($ext === 'mpd') {
                    return 'dash';
                }
                if ($ext === 'm4s' || $ext === 'mp4') {
                    $hasFmp4 = true;
                } elseif ($ext === 'ts') {
                    $hasTs = true;
                }
            }
        }
        
        if ($hasFmp4 && !$hasTs) {
            return 'fmp4';
        }
        
        if ($hasTs && !$hasFmp4) {
            return 'ts';
        }
        
        if ($hasFmp4 && $hasTs) {
            return 'mixed';
        }
        
        return 'hls';
    }

    private function detectSegmentType(array $facts): string
    {
        if (!empty($facts['x_map_tags'])) {
            return 'fmp4';
        }
        
        if (!empty($facts['stream_variants'])) {
            foreach ($facts['stream_variants'] as $variant) {
                if (isset($variant['url'])) {
                    if (str_ends_with(strtolower($variant['url']), '.mpd')) {
                        return 'dash';
                    }
                }
            }
        }
        
        return 'ts';
    }

    private function resolveUrl(string $url, string $baseUrl): string
    {
        if (preg_match('/^https?:\/\//i', $url)) {
            return $url;
        }
        
        if (empty($baseUrl)) {
            return $url;
        }
        
        $baseParts = parse_url($baseUrl);
        if ($baseParts === false) {
            return $url;
        }
        
        if (str_starts_with($url, '//')) {
            return ($baseParts['scheme'] ?? 'https') . ':' . $url;
        }
        
        if (str_starts_with($url, '/')) {
            return ($baseParts['scheme'] ?? 'https') . '://' . ($baseParts['host'] ?? '') . $url;
        }
        
        $basePath = dirname($baseParts['path'] ?? '/');
        return ($baseParts['scheme'] ?? 'https') . '://' . ($baseParts['host'] ?? '') . $basePath . '/' . $url;
    }

    // ==================== TRANSPORT ANALYSIS ====================

    private function analyzeTransport(array $manifestFacts): array
    {
        return [
            'detected_format' => $manifestFacts['detected_format'] ?? 'unknown',
            'segment_type' => $manifestFacts['segment_type'] ?? 'unknown',
            'hls_version' => $manifestFacts['hls_version'] ?? 3,
            'has_init_segment' => !empty($manifestFacts['x_map_tags']),
            'init_segments' => $manifestFacts['x_map_tags'] ?? [],
            'is_live' => !isset($manifestFacts['is_vod']) && !isset($manifestFacts['playlist_type']) || ($manifestFacts['playlist_type'] ?? '') !== 'VOD',
            'has_encryption' => isset($manifestFacts['encryption']) && $manifestFacts['encryption']['method'] !== 'NONE',
            'encryption_method' => $manifestFacts['encryption']['method'] ?? null,
            'low_latency' => isset($manifestFacts['server_control']),
            'll_hls_features' => $this->detectLlHlsFeatures($manifestFacts),
            'transport_compatibility' => $this->assessTransportCompatibility($manifestFacts),
        ];
    }

    private function detectLlHlsFeatures(array $facts): array
    {
        return [
            'server_control' => isset($facts['server_control']),
            'can_block_reload' => $facts['server_control']['can_block_reload'] ?? false,
            'preload_hint' => isset($facts['preload_hint']),
            'delta_updates' => false,
        ];
    }

    private function assessTransportCompatibility(array $facts): array
    {
        $issues = [];
        
        if (($facts['detected_format'] ?? '') === 'mixed') {
            $issues[] = [
                'type' => 'mixed_formats',
                'severity' => 'warning',
                'message' => 'Manifest contains mixed TS and fMP4 segments',
            ];
        }
        
        if (!empty($facts['x_map_tags']) && ($facts['detected_format'] ?? '') === 'ts') {
            $issues[] = [
                'type' => 'format_mismatch',
                'severity' => 'error',
                'message' => 'Init segment found but segments appear to be TS',
            ];
        }
        
        return [
            'compatible' => empty(array_filter($issues, fn($i) => $i['severity'] === 'error')),
            'issues' => $issues,
        ];
    }

    // ==================== CODEC ANALYSIS ====================

    private function analyzeCodecs(array $manifestFacts): array
    {
        $allCodecs = [
            'video' => [],
            'audio' => [],
            'subtitle' => [],
        ];
        
        foreach ($manifestFacts['stream_variants'] ?? [] as $variant) {
            if (!empty($variant['codecs']['video'])) {
                foreach ($variant['codecs']['video'] as $codec) {
                    $allCodecs['video'][] = array_merge($codec, ['variant_bandwidth' => $variant['bandwidth']]);
                }
            }
            if (!empty($variant['codecs']['audio'])) {
                foreach ($variant['codecs']['audio'] as $codec) {
                    $allCodecs['audio'][] = $codec;
                }
            }
        }
        
        $uniqueVideoCodecs = $this->getUniqueVideoCodecs($allCodecs['video']);
        
        return [
            'available_video_codecs' => $uniqueVideoCodecs,
            'available_audio_codecs' => $this->getUniqueAudioCodecs($allCodecs['audio']),
            'best_video_codec' => $this->selectBestVideoCodec($uniqueVideoCodecs),
            'hdr_support' => $this->detectHdrSupport($manifestFacts),
            'lcevc_support' => $this->detectLcevcSupport($manifestFacts),
            'codec_priority_applied' => $this->config['codec_priority'],
        ];
    }

    private function getUniqueVideoCodecs(array $videoCodecs): array
    {
        $unique = [];
        foreach ($videoCodecs as $codec) {
            $key = $codec['codec'];
            if (!isset($unique[$key]) || ($codec['variant_bandwidth'] ?? 0) > ($unique[$key]['variant_bandwidth'] ?? 0)) {
                $unique[$key] = $codec;
            }
        }
        return array_values($unique);
    }

    private function getUniqueAudioCodecs(array $audioCodecs): array
    {
        $unique = [];
        foreach ($audioCodecs as $codec) {
            $key = $codec['codec'];
            if (!isset($unique[$key])) {
                $unique[$key] = $codec;
            }
        }
        return array_values($unique);
    }

    private function selectBestVideoCodec(array $availableCodecs): array
    {
        if (empty($availableCodecs)) {
            return ['codec' => 'unknown', 'priority' => 0];
        }
        
        $best = null;
        $bestPriority = -1;
        
        foreach ($availableCodecs as $codec) {
            $priority = $this->config['codec_priority'][$codec['codec']] ?? 0;
            if ($priority > $bestPriority) {
                $bestPriority = $priority;
                $best = $codec;
            }
        }
        
        return $best ?? $availableCodecs[0];
    }

    private function detectHdrSupport(array $facts): array
    {
        $hdrInfo = [
            'detected' => false,
            'types' => [],
            'video_range' => 'SDR',
        ];
        
        foreach ($facts['stream_variants'] ?? [] as $variant) {
            $videoRange = $variant['video_range'] ?? 'SDR';
            if ($videoRange !== 'SDR') {
                $hdrInfo['detected'] = true;
                $hdrInfo['types'][] = $videoRange;
                $hdrInfo['video_range'] = $videoRange;
            }
        }
        
        foreach ($facts['codecs']['video'] ?? [] as $videoCodec) {
            if (stripos($videoCodec['raw'] ?? '', 'DVH') !== false) {
                $hdrInfo['detected'] = true;
                $hdrInfo['types'][] = 'DOLBY_VISION';
            }
        }
        
        $hdrInfo['types'] = array_unique($hdrInfo['types']);
        
        return $hdrInfo;
    }

    private function detectLcevcSupport(array $facts): array
    {
        return [
            'detected' => false,
            'available' => false,
            'enhancement_layers' => 0,
            'base_codec' => null,
            'note' => 'LCEVC must be detected in codec parameters or as separate enhancement stream',
        ];
    }

    // ==================== VIDEO PIPELINE ANALYSIS ====================

    private function analyzeVideoPipeline(array $manifestFacts): array
    {
        $variants = $manifestFacts['stream_variants'] ?? [];
        
        usort($variants, fn($a, $b) => ($b['bandwidth'] ?? 0) <=> ($a['bandwidth'] ?? 0));
        
        return [
            'available_resolutions' => $this->extractResolutions($variants),
            'available_framerates' => $this->extractFramerates($variants),
            'available_bitrates' => $this->extractBitrates($variants),
            'max_resolution' => $this->getMaxResolution($variants),
            'max_framerate' => $this->getMaxFramerate($variants),
            'max_bitrate' => $this->getMaxBitrate($variants),
            'min_bitrate' => $this->getMinBitrate($variants),
            'interlace_detection' => $this->detectInterlace($manifestFacts),
            'abr_ladder' => $this->buildAbrLadder($variants),
        ];
    }

    private function extractResolutions(array $variants): array
    {
        $resolutions = [];
        foreach ($variants as $variant) {
            if (!empty($variant['resolution'])) {
                $key = $variant['resolution']['width'] . 'x' . $variant['resolution']['height'];
                if (!isset($resolutions[$key])) {
                    $resolutions[$key] = [
                        'resolution' => $variant['resolution'],
                        'min_bitrate' => $variant['bandwidth'],
                        'max_bitrate' => $variant['bandwidth'],
                    ];
                } else {
                    $resolutions[$key]['min_bitrate'] = min($resolutions[$key]['min_bitrate'], $variant['bandwidth']);
                    $resolutions[$key]['max_bitrate'] = max($resolutions[$key]['max_bitrate'], $variant['bandwidth']);
                }
            }
        }
        return array_values($resolutions);
    }

    private function extractFramerates(array $variants): array
    {
        $framerates = [];
        foreach ($variants as $variant) {
            $fps = $variant['frame_rate'] ?? null;
            if ($fps !== null && !in_array($fps, $framerates)) {
                $framerates[] = $fps;
            }
        }
        sort($framerates);
        return $framerates;
    }

    private function extractBitrates(array $variants): array
    {
        $bitrates = [];
        foreach ($variants as $variant) {
            if (!empty($variant['bandwidth'])) {
                $bitrates[] = [
                    'bandwidth' => $variant['bandwidth'],
                    'average_bandwidth' => $variant['average_bandwidth'] ?? $variant['bandwidth'],
                    'resolution' => $variant['resolution'] ?? null,
                ];
            }
        }
        usort($bitrates, fn($a, $b) => $a['bandwidth'] <=> $b['bandwidth']);
        return $bitrates;
    }

    private function getMaxResolution(array $variants): array
    {
        $max = ['width' => 0, 'height' => 0];
        foreach ($variants as $variant) {
            if (!empty($variant['resolution'])) {
                if ($variant['resolution']['height'] > $max['height']) {
                    $max = $variant['resolution'];
                }
            }
        }
        return $max;
    }

    private function getMaxFramerate(array $variants): float
    {
        $max = 0.0;
        foreach ($variants as $variant) {
            $fps = $variant['frame_rate'] ?? 0;
            if ($fps > $max) {
                $max = $fps;
            }
        }
        return $max;
    }

    private function getMaxBitrate(array $variants): int
    {
        $max = 0;
        foreach ($variants as $variant) {
            $bw = $variant['bandwidth'] ?? 0;
            if ($bw > $max) {
                $max = $bw;
            }
        }
        return $max;
    }

    private function getMinBitrate(array $variants): int
    {
        $min = PHP_INT_MAX;
        foreach ($variants as $variant) {
            $bw = $variant['bandwidth'] ?? PHP_INT_MAX;
            if ($bw < $min) {
                $min = $bw;
            }
        }
        return $min === PHP_INT_MAX ? 0 : $min;
    }

    private function detectInterlace(array $facts): array
    {
        return [
            'detected' => false,
            'confidence' => 'low',
            'source' => 'inferred',
            'recommended_mode' => 'bwdif',
            'reason' => 'Interlace detection requires codec-level analysis or explicit signaling',
        ];
    }

    private function buildAbrLadder(array $variants): array
    {
        $ladder = [];
        
        foreach ($variants as $variant) {
            if (!empty($variant['bandwidth'])) {
                $ladder[] = [
                    'bitrate' => $variant['bandwidth'],
                    'resolution' => $variant['resolution'],
                    'frame_rate' => $variant['frame_rate'] ?? null,
                    'codecs' => $variant['codecs']['raw'] ?? null,
                    'video_range' => $variant['video_range'] ?? 'SDR',
                    'url' => $variant['url'] ?? null,
                ];
            }
        }
        
        usort($ladder, fn($a, $b) => $a['bitrate'] <=> $b['bitrate']);
        
        return $ladder;
    }

    // ==================== DIRECTIVE NORMALIZATION ====================

    private function normalizeDirectives(array $context): array
    {
        $normalization = [
            'vlcopt_normalized' => [],
            'kodiprop_normalized' => [],
            'exthttp_normalized' => [],
            'extattr_normalized' => [],
            'merged_directives' => [],
            'conflicts' => [],
            'precedence_applied' => [],
        ];
        
        $vlcoptDirectives = $context['manifest_facts']['vlcopt_directives'] ?? [];
        $kodipropDirectives = $context['manifest_facts']['kodiprop_directives'] ?? [];
        
        $normalizedVlcopt = $this->normalizeVlcoptDirectives($vlcoptDirectives);
        $normalizedKodiprop = $this->normalizeKodipropDirectives($kodipropDirectives);
        
        $normalization['vlcopt_normalized'] = $normalizedVlcopt;
        $normalization['kodiprop_normalized'] = $normalizedKodiprop;
        
        $merged = $this->mergeDirectives($normalizedVlcopt, $normalizedKodiprop);
        $normalization['merged_directives'] = $merged['merged'];
        $normalization['conflicts'] = $merged['conflicts'];
        
        $normalization['exthttp_normalized'] = $this->normalizeExthttpDirectives(
            $context['manifest_facts']['exthttp_directives'] ?? []
        );
        
        $normalization['extattr_normalized'] = $context['manifest_facts']['extattr_directives'] ?? [];
        
        $context['directive_normalization'] = $normalization;
        
        return $context;
    }

    private function normalizeVlcoptDirectives(array $directives): array
    {
        $normalized = [];
        $seen = [];
        
        foreach ($directives as $directive) {
            $key = strtolower($directive['key'] ?? '');
            $value = $directive['value'] ?? '';
            
            if (empty($key)) {
                continue;
            }
            
            $normalizedKey = $this->normalizeDirectiveKey($key, 'vlcopt');
            
            if (isset($seen[$normalizedKey])) {
                continue;
            }
            
            $seen[$normalizedKey] = true;
            $normalized[$normalizedKey] = [
                'original_key' => $directive['key'],
                'normalized_key' => $normalizedKey,
                'value' => $value,
                'source' => 'vlcopt',
                'raw' => $directive['raw'],
            ];
        }
        
        return $normalized;
    }

    private function normalizeKodipropDirectives(array $directives): array
    {
        $normalized = [];
        $seen = [];
        
        foreach ($directives as $directive) {
            $key = strtolower($directive['key'] ?? '');
            $value = $directive['value'] ?? '';
            
            if (empty($key)) {
                continue;
            }
            
            $normalizedKey = $this->normalizeDirectiveKey($key, 'kodiprop');
            
            if (isset($seen[$normalizedKey])) {
                continue;
            }
            
            $seen[$normalizedKey] = true;
            $normalized[$normalizedKey] = [
                'original_key' => $directive['key'],
                'normalized_key' => $normalizedKey,
                'value' => $value,
                'source' => 'kodiprop',
                'raw' => $directive['raw'],
            ];
        }
        
        return $normalized;
    }

    private function normalizeDirectiveKey(string $key, string $source): string
    {
        $keyMap = [
            'http-referrer' => 'http_referer',
            'http-referer' => 'http_referer',
            'http-user-agent' => 'user_agent',
            'user-agent' => 'user_agent',
            'http-cookie' => 'http_cookie',
            'program' => 'program',
            'input-live' => 'input_live',
            'network-caching' => 'network_caching',
            'deinterlace' => 'deinterlace_mode',
            'deinterlace-mode' => 'deinterlace_mode',
        ];
        
        return $keyMap[$key] ?? $key;
    }

    private function mergeDirectives(array $vlcopt, array $kodiprop): array
    {
        $merged = [];
        $conflicts = [];
        
        foreach ($vlcopt as $key => $directive) {
            $merged[$key] = $directive;
        }
        
        foreach ($kodiprop as $key => $directive) {
            if (isset($merged[$key])) {
                if ($merged[$key]['value'] !== $directive['value']) {
                    $conflicts[] = [
                        'key' => $key,
                        'vlcopt_value' => $merged[$key]['value'],
                        'kodiprop_value' => $directive['value'],
                        'winner' => 'vlcopt',
                        'reason' => 'EXTVLCOPT takes precedence over KODIPROP',
                    ];
                }
            } else {
                $merged[$key] = $directive;
            }
        }
        
        return ['merged' => $merged, 'conflicts' => $conflicts];
    }

    private function normalizeExthttpDirectives(array $directives): array
    {
        $normalized = [];
        
        foreach ($directives as $index => $directive) {
            $normalized[$index] = [
                'headers' => $directive['headers'] ?? [],
                'method' => $directive['method'] ?? 'GET',
                'raw' => $directive['raw'] ?? null,
            ];
        }
        
        return $normalized;
    }

    // ==================== CONFLICT RESOLUTION ====================

    private function resolveConflicts(array $context): array
    {
        $conflictsResolved = [];
        $warnings = [];
        
        $normalizationConflicts = $context['directive_normalization']['conflicts'] ?? [];
        
        foreach ($normalizationConflicts as $conflict) {
            $conflictsResolved[] = [
                'type' => 'directive_conflict',
                'key' => $conflict['key'],
                'winner' => $conflict['winner'],
                'discarded' => $conflict['winner'] === 'vlcopt' ? 'kodiprop' : 'vlcopt',
                'reason' => $conflict['reason'],
            ];
        }
        
        $transportIssues = $context['transport_facts']['transport_compatibility']['issues'] ?? [];
        foreach ($transportIssues as $issue) {
            if ($issue['severity'] === 'warning') {
                $warnings[] = [
                    'type' => 'transport_warning',
                    'message' => $issue['message'],
                ];
            }
        }
        
        $resolutionConflicts = $this->detectResolutionConflicts($context);
        foreach ($resolutionConflicts as $conflict) {
            $conflictsResolved[] = $conflict;
        }
        
        $context['conflicts_resolved'] = $conflictsResolved;
        $context['warnings'] = array_merge($context['warnings'] ?? [], $warnings);
        
        return $context;
    }

    private function detectResolutionConflicts(array $context): array
    {
        $conflicts = [];
        
        $deviceMaxResolution = $context['device_profile']['screen_resolution'] ?? [];
        $streamMaxResolution = $context['video_pipeline_facts']['max_resolution'] ?? [];
        
        if (!empty($deviceMaxResolution) && !empty($streamMaxResolution)) {
            if ($streamMaxResolution['height'] > $deviceMaxResolution['height']) {
                $conflicts[] = [
                    'type' => 'resolution_mismatch',
                    'stream_resolution' => $streamMaxResolution,
                    'device_resolution' => $deviceMaxResolution,
                    'resolution' => 'will_downscale',
                    'reason' => 'Stream resolution exceeds device screen capability',
                ];
            }
        }
        
        return $conflicts;
    }

    // ==================== QUALITY DECISION ENGINE ====================

    private function makeQualityDecision(array $context): array
    {
        $decision = [
            'decision_id' => bin2hex(random_bytes(4)),
            'timestamp' => date('c'),
            'selected_variant' => null,
            'selected_codec' => null,
            'selected_resolution' => null,
            'selected_bitrate' => null,
            'selected_framerate' => null,
            'hdr_mode' => null,
            'deinterlace_mode' => null,
            'abr_state' => null,
            'transport_mode' => null,
            'enhancement_layers' => [],
            'quality_score' => 0,
            'decision_trace' => [],
        ];
        
        $decision['decision_trace'][] = [
            'step' => 'initialization',
            'message' => 'Starting quality decision process',
        ];
        
        $variant = $this->selectOptimalVariant($context);
        $decision['selected_variant'] = $variant;
        $decision['decision_trace'][] = [
            'step' => 'variant_selection',
            'message' => 'Selected variant based on device/network constraints',
            'result' => $variant['url'] ?? null,
        ];
        
        $decision['selected_codec'] = $this->determineCodec($context, $variant);
        $decision['decision_trace'][] = [
            'step' => 'codec_selection',
            'message' => 'Codec determined based on device support and availability',
            'result' => $decision['selected_codec'],
        ];
        
        $decision['selected_resolution'] = $this->determineResolution($context, $variant);
        $decision['decision_trace'][] = [
            'step' => 'resolution_selection',
            'message' => 'Resolution determined based on stream and device capabilities',
            'result' => $decision['selected_resolution'],
        ];
        
        $decision['selected_bitrate'] = $this->determineBitrate($context, $variant);
        $decision['decision_trace'][] = [
            'step' => 'bitrate_selection',
            'message' => 'Bitrate determined based on network profile',
            'result' => $decision['selected_bitrate'],
        ];
        
        $decision['selected_framerate'] = $this->determineFramerate($context, $variant);
        
        $decision['hdr_mode'] = $this->determineHdrMode($context, $variant);
        $decision['decision_trace'][] = [
            'step' => 'hdr_selection',
            'message' => 'HDR mode determined based on stream and device support',
            'result' => $decision['hdr_mode'],
        ];
        
        $decision['deinterlace_mode'] = $this->determineDeinterlaceMode($context);
        
        $decision['abr_state'] = $this->determineAbrState($context);
        $decision['decision_trace'][] = [
            'step' => 'abr_configuration',
            'message' => 'ABR state configured',
            'result' => $decision['abr_state'],
        ];
        
        $decision['transport_mode'] = $this->determineTransportMode($context);
        
        $decision['enhancement_layers'] = $this->determineEnhancementLayers($context);
        
        $decision['quality_score'] = $this->calculateQualityScore($decision, $context);
        
        $decision['fallback_chain'] = $this->buildFallbackChain($context);
        
        return $decision;
    }

    private function selectOptimalVariant(array $context): array
    {
        $variants = $context['manifest_facts']['stream_variants'] ?? [];
        
        if (empty($variants)) {
            return ['url' => $context['manifest_url'], 'bandwidth' => 0, 'resolution' => null];
        }
        
        $deviceMaxBitrate = $context['device_profile']['max_bitrate'] ?? PHP_INT_MAX;
        $networkBandwidth = $context['network_profile']['stable_bandwidth'] ?? PHP_INT_MAX;
        $deviceResolution = $context['device_profile']['screen_resolution'] ?? ['width' => 1920, 'height' => 1080];
        
        $effectiveMaxBitrate = min($deviceMaxBitrate, $networkBandwidth);
        $safetyMargin = $this->config['abr_safety_margin'];
        $targetBitrate = $effectiveMaxBitrate * (1 - $safetyMargin);
        
        $compatibleVariants = [];
        
        foreach ($variants as $variant) {
            $variantBitrate = $variant['bandwidth'] ?? 0;
            
            if ($variantBitrate > $effectiveMaxBitrate) {
                continue;
            }
            
            $variantResolution = $variant['resolution'] ?? ['height' => 0];
            if ($variantResolution['height'] > $deviceResolution['height'] * 1.5) {
                continue;
            }
            
            $compatibleVariants[] = $variant;
        }
        
        if (empty($compatibleVariants)) {
            usort($variants, fn($a, $b) => ($a['bandwidth'] ?? 0) <=> ($b['bandwidth'] ?? 0));
            return $variants[0] ?? ['url' => $context['manifest_url'], 'bandwidth' => 0];
        }
        
        usort($compatibleVariants, function ($a, $b) use ($targetBitrate) {
            $diffA = abs(($a['bandwidth'] ?? 0) - $targetBitrate);
            $diffB = abs(($b['bandwidth'] ?? 0) - $targetBitrate);
            
            if (abs($diffA - $diffB) < $targetBitrate * 0.1) {
                return ($b['resolution']['height'] ?? 0) <=> ($a['resolution']['height'] ?? 0);
            }
            
            return $diffA <=> $diffB;
        });
        
        return $compatibleVariants[0];
    }

    private function determineCodec(array $context, array $variant): array
    {
        $deviceCodecSupport = $context['device_profile']['codec_support'] ?? [];
        $availableCodecs = $context['codec_facts']['available_video_codecs'] ?? [];
        $variantCodecs = $variant['codecs']['video'] ?? [];
        
        $codecPriority = $this->config['codec_priority'];
        arsort($codecPriority);
        
        foreach ($variantCodecs as $codec) {
            $codecName = $codec['codec'] ?? '';
            
            if (!isset($deviceCodecSupport[$codecName])) {
                continue;
            }
            
            if (!($deviceCodecSupport[$codecName]['decode'] ?? false)) {
                continue;
            }
            
            return [
                'codec' => $codecName,
                'profile' => $codec['profile'] ?? 'unknown',
                'level' => $codec['level'] ?? 0,
                'source' => 'variant',
                'device_supported' => true,
            ];
        }
        
        foreach ($codecPriority as $codecName => $priority) {
            if (isset($deviceCodecSupport[$codecName]) && ($deviceCodecSupport[$codecName]['decode'] ?? false)) {
                foreach ($availableCodecs as $availableCodec) {
                    if (($availableCodec['codec'] ?? '') === $codecName) {
                        return [
                            'codec' => $codecName,
                            'profile' => $availableCodec['profile'] ?? 'unknown',
                            'level' => $availableCodec['level'] ?? 0,
                            'source' => 'fallback',
                            'device_supported' => true,
                        ];
                    }
                }
            }
        }
        
        return [
            'codec' => 'avc',
            'profile' => 'high',
            'level' => 4.0,
            'source' => 'default_fallback',
            'device_supported' => true,
        ];
    }

    private function determineResolution(array $context, array $variant): array
    {
        $deviceResolution = $context['device_profile']['screen_resolution'] ?? ['width' => 1920, 'height' => 1080];
        $streamResolution = $variant['resolution'] ?? null;
        
        if ($streamResolution === null) {
            return [
                'width' => $deviceResolution['width'],
                'height' => $deviceResolution['height'],
                'label' => $this->getResolutionLabel($deviceResolution['height']),
                'source' => 'device_default',
            ];
        }
        
        $effectiveWidth = min($streamResolution['width'] ?? 1920, $deviceResolution['width'] ?? 1920);
        $effectiveHeight = min($streamResolution['height'] ?? 1080, $deviceResolution['height'] ?? 1080);
        
        if ($streamResolution['height'] > $deviceResolution['height']) {
            $aspectRatio = $streamResolution['width'] / $streamResolution['height'];
            $effectiveWidth = (int)($deviceResolution['height'] * $aspectRatio);
            $effectiveHeight = $deviceResolution['height'];
        }
        
        return [
            'width' => $effectiveWidth,
            'height' => $effectiveHeight,
            'label' => $this->getResolutionLabel($effectiveHeight),
            'stream_resolution' => $streamResolution,
            'device_resolution' => $deviceResolution,
            'source' => 'calculated',
        ];
    }

    private function determineBitrate(array $context, array $variant): array
    {
        $variantBandwidth = $variant['bandwidth'] ?? 0;
        $networkBandwidth = $context['network_profile']['stable_bandwidth'] ?? PHP_INT_MAX;
        $deviceMaxBitrate = $context['device_profile']['max_bitrate'] ?? PHP_INT_MAX;
        
        $effectiveBitrate = min($variantBandwidth, $networkBandwidth, $deviceMaxBitrate);
        $effectiveBitrate = (int)($effectiveBitrate * 0.9);
        
        return [
            'target_bitrate' => $effectiveBitrate,
            'variant_bitrate' => $variantBandwidth,
            'network_limit' => $networkBandwidth,
            'device_limit' => $deviceMaxBitrate,
            'safe_percentage' => round(($effectiveBitrate / max($variantBandwidth, 1)) * 100, 1),
        ];
    }

    private function determineFramerate(array $context, array $variant): array
    {
        $streamFps = $variant['frame_rate'] ?? null;
        $deviceRefreshRate = $context['device_profile']['screen_refresh_rate'] ?? 60;
        
        if ($streamFps === null) {
            return [
                'fps' => 30,
                'source' => 'default',
                'match_refresh_rate' => false,
            ];
        }
        
        $matchRefreshRate = false;
        if (in_array($streamFps, [24, 25, 30, 50, 60]) && 
            (abs($streamFps - $deviceRefreshRate) < 1 || 
             abs($streamFps * 2 - $deviceRefreshRate) < 1 ||
             abs($streamFps * 2.5 - $deviceRefreshRate) < 1)) {
            $matchRefreshRate = true;
        }
        
        return [
            'fps' => $streamFps,
            'source' => 'stream',
            'match_refresh_rate' => $matchRefreshRate,
            'device_refresh_rate' => $deviceRefreshRate,
        ];
    }

    private function determineHdrMode(array $context, array $variant): array
    {
        $deviceHdrSupport = $context['device_profile']['hdr_support'] ?? [];
        $streamVideoRange = $variant['video_range'] ?? 'SDR';
        $codecFactsHdr = $context['codec_facts']['hdr_support'] ?? [];
        
        if ($streamVideoRange === 'SDR') {
            return [
                'mode' => 'sdr',
                'source' => 'stream_sdr',
                'tone_mapping' => null,
            ];
        }
        
        $hdrType = strtolower($streamVideoRange);
        
        if (isset($deviceHdrSupport[$hdrType]) && $deviceHdrSupport[$hdrType]) {
            return [
                'mode' => $hdrType,
                'passthrough' => true,
                'tone_mapping' => null,
                'source' => 'native_support',
            ];
        }
        
        if (isset($deviceHdrSupport['hdr10']) && $deviceHdrSupport['hdr10'] && 
            in_array($hdrType, ['hdr10', 'hdr10plus'])) {
            return [
                'mode' => 'hdr10',
                'passthrough' => true,
                'tone_mapping' => null,
                'source' => 'fallback_to_hdr10',
                'original_mode' => $hdrType,
            ];
        }
        
        $toneMappingMethod = $this->config['hdr_tone_mapping']["{$hdrType}_to_sdr"] ?? 'hable';
        
        return [
            'mode' => 'sdr',
            'passthrough' => false,
            'tone_mapping' => $toneMappingMethod,
            'source' => 'tone_mapped',
            'original_mode' => $hdrType,
            'reason' => 'Device does not support HDR mode from stream',
        ];
    }

    private function determineDeinterlaceMode(array $context): array
    {
        $interlaceDetection = $context['video_pipeline_facts']['interlace_detection'] ?? [];
        $deviceProfile = $context['device_profile'] ?? [];
        
        if (!($interlaceDetection['detected'] ?? false)) {
            return [
                'required' => false,
                'mode' => null,
                'reason' => 'No interlaced content detected',
            ];
        }
        
        $preferredMode = $this->config['deinterlace_modes']['bwdif'] ?? [];
        
        return [
            'required' => true,
            'mode' => 'bwdif',
            'quality' => $preferredMode['quality'] ?? 95,
            'performance_impact' => 'moderate',
            'reason' => 'Interlaced content detected',
        ];
    }

    private function determineAbrState(array $context): array
    {
        $playerProfile = $context['player_profile'] ?? [];
        $networkProfile = $context['network_profile'] ?? [];
        $videoPipeline = $context['video_pipeline_facts'] ?? [];
        
        $abrEnabled = $playerProfile['abr_enabled'] ?? true;
        $networkStability = ($networkProfile['bandwidth_variance'] ?? 0.1) < 0.2;
        $bitrateRange = ($videoPipeline['max_bitrate'] ?? 0) - ($videoPipeline['min_bitrate'] ?? 0);
        $hasMultipleVariants = count($videoPipeline['abr_ladder'] ?? []) > 1;
        
        if (!$abrEnabled) {
            return [
                'enabled' => false,
                'reason' => 'ABR disabled in player profile',
            ];
        }
        
        if (!$hasMultipleVariants) {
            return [
                'enabled' => false,
                'reason' => 'Single variant available',
                'fixed_bitrate' => $videoPipeline['max_bitrate'] ?? 0,
            ];
        }
        
        $algorithm = $networkStability ? 'throughput' : 'buffer';
        
        return [
            'enabled' => true,
            'algorithm' => $algorithm,
            'start_bitrate' => min($networkProfile['stable_bandwidth'] ?? 2000000, $videoPipeline['max_bitrate'] ?? 15000000),
            'min_bitrate' => $videoPipeline['min_bitrate'] ?? 500000,
            'max_bitrate' => min(
                $networkProfile['stable_bandwidth'] * 1.2,
                $videoPipeline['max_bitrate'] ?? 15000000
            ),
            'buffer_target' => $playerProfile['buffer_target'] ?? 30,
            'buffer_min' => $playerProfile['buffer_min'] ?? 5,
            'safety_margin' => $this->config['abr_safety_margin'],
        ];
    }

    private function determineTransportMode(array $context): array
    {
        $transportFacts = $context['transport_facts'] ?? [];
        $playerProfile = $context['player_profile'] ?? [];
        
        $detectedFormat = $transportFacts['detected_format'] ?? 'unknown';
        $playerSupportsCmaf = $playerProfile['support_cmaf'] ?? true;
        $playerSupportsFmp4 = $playerProfile['support_fmp4'] ?? true;
        $playerSupportsDash = $playerProfile['support_dash'] ?? false;
        
        $transportMode = match ($detectedFormat) {
            'cmaf', 'fmp4' => $playerSupportsCmaf ? 'cmaf' : ($playerSupportsFmp4 ? 'fmp4' : 'ts'),
            'ts' => 'ts',
            'dash' => $playerSupportsDash ? 'dash' : 'ts',
            'mixed' => 'cmaf',
            default => 'ts',
        };
        
        return [
            'mode' => $transportMode,
            'detected_format' => $detectedFormat,
            'has_init_segment' => $transportFacts['has_init_segment'] ?? false,
            'segment_type' => $transportFacts['segment_type'] ?? 'ts',
            'hls_version' => $transportFacts['hls_version'] ?? 3,
            'is_live' => $transportFacts['is_live'] ?? true,
            'll_hls' => $transportFacts['low_latency'] ?? false,
        ];
    }

    private function determineEnhancementLayers(array $context): array
    {
        $lcevcSupport = $context['codec_facts']['lcevc_support'] ?? [];
        $deviceLcevcSupport = $context['device_profile']['lcevc_support'] ?? false;
        
        if (!($lcevcSupport['detected'] ?? false)) {
            return [
                'lcevc' => [
                    'available' => false,
                    'status' => 'not_detected_in_stream',
                ],
            ];
        }
        
        if (!$deviceLcevcSupport) {
            return [
                'lcevc' => [
                    'available' => true,
                    'enabled' => false,
                    'status' => 'device_not_capable',
                    'note' => 'LCEVC enhancement detected but device does not support decoding',
                ],
            ];
        }
        
        return [
            'lcevc' => [
                'available' => true,
                'enabled' => true,
                'status' => 'active',
                'base_codec' => $lcevcSupport['base_codec'] ?? 'avc',
                'enhancement_layers' => $lcevcSupport['enhancement_layers'] ?? 1,
                'tune_mode' => 'vq',
            ],
        ];
    }

    private function calculateQualityScore(array $decision, array $context): array
    {
        $score = 0;
        $maxScore = 100;
        $factors = [];
        
        $resolutionHeight = $decision['selected_resolution']['height'] ?? 0;
        if ($resolutionHeight >= 2160) {
            $score += 25;
            $factors['resolution'] = 25;
        } elseif ($resolutionHeight >= 1080) {
            $score += 20;
            $factors['resolution'] = 20;
        } elseif ($resolutionHeight >= 720) {
            $score += 15;
            $factors['resolution'] = 15;
        } else {
            $score += 10;
            $factors['resolution'] = 10;
        }
        
        $codec = $decision['selected_codec']['codec'] ?? 'avc';
        if ($codec === 'hevc' || $codec === 'h265') {
            $score += 20;
            $factors['codec'] = 20;
        } elseif ($codec === 'av1') {
            $score += 25;
            $factors['codec'] = 25;
        } elseif ($codec === 'vp9') {
            $score += 18;
            $factors['codec'] = 18;
        } else {
            $score += 12;
            $factors['codec'] = 12;
        }
        
        $bitrate = $decision['selected_bitrate']['target_bitrate'] ?? 0;
        if ($bitrate >= 10000000) {
            $score += 20;
            $factors['bitrate'] = 20;
        } elseif ($bitrate >= 5000000) {
            $score += 15;
            $factors['bitrate'] = 15;
        } elseif ($bitrate >= 2000000) {
            $score += 10;
            $factors['bitrate'] = 10;
        } else {
            $score += 5;
            $factors['bitrate'] = 5;
        }
        
        $hdrMode = $decision['hdr_mode']['mode'] ?? 'sdr';
        if ($hdrMode !== 'sdr' && ($decision['hdr_mode']['passthrough'] ?? false)) {
            $score += 15;
            $factors['hdr'] = 15;
        } elseif ($hdrMode !== 'sdr') {
            $score += 10;
            $factors['hdr'] = 10;
        } else {
            $factors['hdr'] = 0;
        }
        
        $fps = $decision['selected_framerate']['fps'] ?? 30;
        if ($fps >= 60) {
            $score += 10;
            $factors['framerate'] = 10;
        } elseif ($fps >= 50) {
            $score += 8;
            $factors['framerate'] = 8;
        } elseif ($fps >= 30) {
            $score += 5;
            $factors['framerate'] = 5;
        }
        
        $abrEnabled = $decision['abr_state']['enabled'] ?? false;
        if ($abrEnabled) {
            $score += 5;
            $factors['abr'] = 5;
        }
        
        $enhancements = $decision['enhancement_layers']['lcevc']['enabled'] ?? false;
        if ($enhancements) {
            $score += 5;
            $factors['enhancements'] = 5;
        }
        
        $percentage = round(($score / $maxScore) * 100, 1);
        
        return [
            'score' => $score,
            'max_score' => $maxScore,
            'percentage' => $percentage,
            'grade' => $this->getQualityGrade($percentage),
            'factors' => $factors,
        ];
    }

    private function getQualityGrade(float $percentage): string
    {
        return match (true) {
            $percentage >= 90 => 'A+',
            $percentage >= 80 => 'A',
            $percentage >= 70 => 'B',
            $percentage >= 60 => 'C',
            $percentage >= 50 => 'D',
            default => 'F',
        };
    }

    private function buildFallbackChain(array $context): array
    {
        $chain = [];
        $variants = $context['video_pipeline_facts']['abr_ladder'] ?? [];
        
        usort($variants, fn($a, $b) => ($b['bitrate'] ?? 0) <=> ($a['bitrate'] ?? 0));
        
        foreach ($variants as $index => $variant) {
            $chain[] = [
                'priority' => $index + 1,
                'url' => $variant['url'] ?? null,
                'bitrate' => $variant['bitrate'] ?? 0,
                'resolution' => $variant['resolution'] ?? null,
                'trigger_condition' => $index === 0 ? 'primary' : 'fallback_on_degradation',
            ];
        }
        
        if (empty($chain)) {
            $chain[] = [
                'priority' => 1,
                'url' => $context['manifest_url'],
                'bitrate' => 0,
                'resolution' => null,
                'trigger_condition' => 'primary_only',
            ];
        }
        
        return $chain;
    }

    // ==================== OUTPUT GENERATION ====================

    private function buildResolvedOutput(array $context): array
    {
        $decision = $context['quality_decision'];
        
        return [
            'selected_variant' => [
                'url' => $decision['selected_variant']['url'] ?? null,
                'bandwidth' => $decision['selected_variant']['bandwidth'] ?? 0,
            ],
            'selected_codec' => $decision['selected_codec'],
            'enhancement_layers' => $decision['enhancement_layers'],
            'render_resolution' => $decision['selected_resolution'],
            'deinterlace_mode' => $decision['deinterlace_mode'],
            'hdr_mode' => $decision['hdr_mode'],
            'transport_mode' => $decision['transport_mode'],
            'abr_state' => $decision['abr_state'],
            'quality_score' => $decision['quality_score'],
            'framerate' => $decision['selected_framerate'],
            'bitrate' => $decision['selected_bitrate'],
            'fallback_chain' => $decision['fallback_chain'],
            'http_headers' => $this->buildHttpHeaders($context),
            'player_options' => $this->buildPlayerOptions($context),
        ];
    }

    private function buildHttpHeaders(array $context): array
    {
        $headers = [];
        
        $mergedDirectives = $context['directive_normalization']['merged_directives'] ?? [];
        
        if (isset($mergedDirectives['http_referer'])) {
            $headers['Referer'] = $mergedDirectives['http_referer']['value'];
        }
        
        if (isset($mergedDirectives['user_agent'])) {
            $headers['User-Agent'] = $mergedDirectives['user_agent']['value'];
        }
        
        if (isset($mergedDirectives['http_cookie'])) {
            $headers['Cookie'] = $mergedDirectives['http_cookie']['value'];
        }
        
        $exthttpHeaders = $context['directive_normalization']['exthttp_normalized'][0]['headers'] ?? [];
        foreach ($exthttpHeaders as $key => $value) {
            $headers[$key] = $value;
        }
        
        return $headers;
    }

    private function buildPlayerOptions(array $context): array
    {
        return [
            'network_caching_ms' => 3000,
            'live_caching_ms' => 1500,
            'deinterlace' => $context['quality_decision']['deinterlace_mode']['required'] ?? false,
            'deinterlace_mode' => $context['quality_decision']['deinterlace_mode']['mode'] ?? null,
            'hardware_decoding' => $context['device_profile']['hardware_decoding'] ?? true,
        ];
    }

    private function generateIdempotencyHash(array $context): string
    {
        $hashData = [
            'manifest_url' => $context['manifest_url'],
            'selected_variant_url' => $context['quality_decision']['selected_variant']['url'] ?? null,
            'selected_codec' => $context['quality_decision']['selected_codec']['codec'] ?? null,
            'selected_resolution' => $context['quality_decision']['selected_resolution'],
            'hdr_mode' => $context['quality_decision']['hdr_mode']['mode'] ?? null,
        ];
        
        return hash('sha256', json_encode($hashData, JSON_UNESCAPED_SLASHES));
    }

    private function updateChannelsMap(string $channelId, array $context): void
    {
        if (!isset($this->channelsMap['channels'])) {
            $this->channelsMap['channels'] = [];
        }
        
        $existingChannel = $this->channelsMap['channels'][$channelId] ?? [];
        
        $this->channelsMap['channels'][$channelId] = array_merge($existingChannel, [
            'channel_id' => $channelId,
            'last_resolved' => date('c'),
            'last_manifest_facts' => $context['manifest_facts'],
            'last_quality_decision' => $context['quality_decision'],
            'idempotency_hash' => $context['idempotency_hash'],
            'resolution_count' => ($existingChannel['resolution_count'] ?? 0) + 1,
        ]);
    }

    private function formatOutput(array $context, float $startTime): array
    {
        $executionTime = round((microtime(true) - $startTime) * 1000, 2);
        
        return [
            'status' => 'success',
            'version' => self::VERSION,
            'resolution_id' => $context['resolution_id'],
            'timestamp' => $context['timestamp'],
            'execution_time_ms' => $executionTime,
            'channel_id' => $context['channel_id'],
            'idempotency_hash' => $context['idempotency_hash'],
            'manifest_url' => $context['manifest_url'],
            'resolved_output' => $context['resolved_output'],
            'decision_trace' => $context['quality_decision']['decision_trace'] ?? [],
            'warnings' => $context['warnings'],
            'conflicts_resolved' => $context['conflicts_resolved'],
            'applied_overrides' => $this->extractAppliedOverrides($context),
            'discarded_conflicts' => $this->extractDiscardedConflicts($context),
            'why' => $this->generateWhyExplanation($context),
        ];
    }

    private function extractAppliedOverrides(array $context): array
    {
        $overrides = [];
        
        $decision = $context['quality_decision'];
        
        if ($decision['hdr_mode']['source'] === 'tone_mapped') {
            $overrides[] = [
                'type' => 'hdr_tone_mapping',
                'from' => $decision['hdr_mode']['original_mode'] ?? 'hdr',
                'to' => 'sdr',
                'method' => $decision['hdr_mode']['tone_mapping'],
            ];
        }
        
        $selectedRes = $decision['selected_resolution'];
        if (isset($selectedRes['stream_resolution']) && 
            $selectedRes['stream_resolution']['height'] !== $selectedRes['height']) {
            $overrides[] = [
                'type' => 'resolution_downscale',
                'from' => $selectedRes['stream_resolution'],
                'to' => ['width' => $selectedRes['width'], 'height' => $selectedRes['height']],
            ];
        }
        
        return $overrides;
    }

    private function extractDiscardedConflicts(array $context): array
    {
        $discarded = [];
        
        foreach ($context['conflicts_resolved'] as $conflict) {
            if (isset($conflict['discarded'])) {
                $discarded[] = [
                    'type' => $conflict['type'],
                    'key' => $conflict['key'] ?? null,
                    'discarded_source' => $conflict['discarded'],
                    'winning_source' => $conflict['winner'],
                ];
            }
        }
        
        return $discarded;
    }

    private function generateWhyExplanation(array $context): array
    {
        $decision = $context['quality_decision'];
        $reasons = [];
        
        $codec = $decision['selected_codec']['codec'] ?? 'unknown';
        $reasons[] = "Selected {$codec} codec as optimal based on device support and availability";
        
        $res = $decision['selected_resolution'];
        $reasons[] = "Target resolution {$res['width']}x{$res['height']} determined by " . ($res['source'] ?? 'calculation');
        
        $hdr = $decision['hdr_mode'];
        if ($hdr['passthrough'] ?? false) {
            $reasons[] = "HDR passthrough enabled - device supports {$hdr['mode']}";
        } elseif (($hdr['mode'] ?? 'sdr') !== 'sdr' && !($hdr['passthrough'] ?? false)) {
            $reasons[] = "HDR tone-mapped to SDR - device lacks {$hdr['original_mode']} support";
        }
        
        $abr = $decision['abr_state'];
        if ($abr['enabled'] ?? false) {
            $reasons[] = "ABR enabled with {$abr['algorithm']} algorithm for adaptive streaming";
        }
        
        return [
            'summary' => implode('. ', $reasons),
            'factors' => $reasons,
            'quality_grade' => $decision['quality_score']['grade'] ?? 'N/A',
        ];
    }

    // ==================== PUBLIC API METHODS ====================

    public function saveChannelsMap(?string $path = null): bool
    {
        $savePath = $path ?? $this->channelsMapPath;
        if (empty($savePath)) {
            return false;
        }
        
        $this->channelsMap['generated_at'] = date('c');
        
        $content = json_encode($this->channelsMap, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        
        return file_put_contents($savePath, $content) !== false;
    }

    public function getChannelsMap(): array
    {
        return $this->channelsMap;
    }

    public function setDeviceProfile(string $channelId, array $profile): void
    {
        if (!isset($this->channelsMap['channels'][$channelId])) {
            $this->channelsMap['channels'][$channelId] = ['channel_id' => $channelId];
        }
        
        $this->channelsMap['channels'][$channelId]['device_profile_override'] = $profile;
    }

    public function setNetworkPolicy(string $channelId, array $policy): void
    {
        if (!isset($this->channelsMap['channels'][$channelId])) {
            $this->channelsMap['channels'][$channelId] = ['channel_id' => $channelId];
        }
        
        $this->channelsMap['channels'][$channelId]['network_policy_override'] = $policy;
    }

    public function setQualityPolicy(string $channelId, array $policy): void
    {
        if (!isset($this->channelsMap['channels'][$channelId])) {
            $this->channelsMap['channels'][$channelId] = ['channel_id' => $channelId];
        }
        
        $this->channelsMap['channels'][$channelId]['quality_policy_override'] = $policy;
    }

    public function getSupportedCodecs(): array
    {
        return self::SUPPORTED_CODECS;
    }

    public function getSupportedTransports(): array
    {
        return self::SUPPORTED_TRANSPORTS;
    }

    public function getSupportedHdrTypes(): array
    {
        return self::HDR_TYPES;
    }

    public function analyzeOnly(string $manifestUrl): array
    {
        return [
            'manifest_facts' => $this->parseManifest($manifestUrl),
            'transport_facts' => $this->analyzeTransport($this->parseManifest($manifestUrl)),
            'codec_facts' => $this->analyzeCodecs($this->parseManifest($manifestUrl)),
        ];
    }
}

// ==================== CLI EXECUTION ====================

if (php_sapi_name() === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_NAME'] ?? '')) {
    $options = getopt('', ['url:', 'channel:', 'output::', 'config::', 'help']);
    
    if (isset($options['help']) || !isset($options['url'])) {
        echo "IPTV Quality Resolution Engine v" . ResolveQuality::VERSION . "\n\n";
        echo "Usage: php resolve_quality.php --url=<manifest_url> [options]\n\n";
        echo "Options:\n";
        echo "  --url=<url>       Manifest URL to analyze (required)\n";
        echo "  --channel=<id>    Channel ID for map integration\n";
        echo "  --output=<path>   Output file path for JSON result\n";
        echo "  --config=<path>   Path to channels_map.json\n";
        echo "  --help            Show this help message\n";
        exit(0);
    }
    
    $engine = new ResolveQuality($options['config'] ?? '');
    
    $result = $engine->resolve(
        $options['url'],
        $options['channel'] ?? '',
        [],
        []
    );
    
    $output = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    
    if (isset($options['output'])) {
        file_put_contents($options['output'], $output);
        echo "Result saved to: {$options['output']}\n";
    } else {
        echo $output . "\n";
    }
}

// ==================== HTTP API ENDPOINT ====================

if (php_sapi_name() !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit(0);
    }
    
    try {
        $manifestUrl = $_GET['url'] ?? $_POST['url'] ?? null;
        $channelId = $_GET['channel'] ?? $_POST['channel'] ?? '';
        
        if (empty($manifestUrl)) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'error' => 'Missing required parameter: url',
                'message' => 'Please provide a manifest URL via ?url= parameter',
            ], JSON_PRETTY_PRINT);
            exit(0);
        }
        
        $deviceProfile = json_decode($_GET['device'] ?? $_POST['device'] ?? '[]', true) ?? [];
        $networkProfile = json_decode($_GET['network'] ?? $_POST['network'] ?? '[]', true) ?? [];
        
        $configPath = __DIR__ . '/channels_map.json';
        $engine = new ResolveQuality($configPath);
        
        $result = $engine->resolve($manifestUrl, $channelId, $deviceProfile, $networkProfile);
        
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString(),
        ], JSON_PRETTY_PRINT);
    }
}
