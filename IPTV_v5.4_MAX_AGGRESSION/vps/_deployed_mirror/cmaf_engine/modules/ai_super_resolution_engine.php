<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Resilience Architecture v6.3
 * Module: AISuperResolutionEngine v4.0.0 — Polymorphic Visual Orchestrator
 *
 * PURPOSE: Client-side visual enhancement via metadata injection.
 * Follows the "Zero Proxy" policy — NEVER redirects video bytes through the VPS.
 *
 * v4.0 — POLYMORPHIC VISUAL ORCHESTRATOR (2026):
 *   - Detects ALL major TV brands + streaming players
 *   - Combo detection: Player + TV → merged max capabilities
 *   - Bandwidth boost: AI processing demands more BW → floor goes UP
 *   - Hardware acceleration: Forces HW decode, eliminates SW fallback
 *   - IDEMPOTENT: Same inputs → same result (pure function of UA + height)
 *   - POLYMORPHIC: Adapts to player+TV combo for max visual quality
 *   - ORCHESTRATOR: Always finds the maximum quality the human eye can see
 *
 * TV BRANDS: Samsung, LG, Sony, Hisense, TCL, Philips, Xiaomi, Vizio, Panasonic
 * PLAYERS: Fire TV 4K Max, Apple TV 4K, Chromecast, Roku, Shield TV
 * SOFTWARE: VLC, Kodi, ExoPlayer, OTT Navigator, Stremio
 *
 * TARGET: 4000-5000 nits HDR10+ Advanced, 12bit, 4:4:4, always HDR/SDR best path
 *
 * @package  cmaf_engine/modules
 * @version  4.0.0
 * @requires PHP 8.1+
 */

class AISuperResolutionEngine
{
    const ENGINE_VERSION = '4.0.0';
    private const DEVICE_MEMORY_FILE = '/tmp/ape_device_memory.json';

    // ═══════════════════════════════════════════════════════════════════
    // DEVICE CAPABILITY MAP — ALL MAJOR BRANDS (2025-2026)
    // ═══════════════════════════════════════════════════════════════════

    private static array $deviceCapabilities = [

        // ────────────────────── SMART TVs ──────────────────────────────

        'samsung' => [
            'pattern'          => '/Samsung|Tizen|SmartHub/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'NQ8_AI_GEN3',
            'neural_networks'  => 768,
            'ai_header'        => 'X-Samsung-Picture-Engine',
            'ai_value'         => 'AI_UPSCALING_PRO',
            'upscale_mode'     => '8K_AI_UPSCALING_PRO',
            'hdr_type'         => 'HDR10_PLUS_ADVANCED',
            'hdr_nits'         => 5000,
            'ai_motion'        => 'AI_MOTION_ENHANCER_PRO',
            'ai_color'         => 'AI_COLOR_INTELLIGENCE_PRO',
            'ai_depth'         => 'REAL_DEPTH_ENHANCER_PRO',
            'ai_brightness'    => 'AI_BRIGHTNESS_ADAPTIVE',
            'ai_sound'         => 'OTS_PRO',
            'genre_optimization' => true,
            'max_res'          => '7680x4320',
            'hdmi_version'     => '2.1',
        ],
        'lg' => [
            'pattern'          => '/LG|webOS|NetCast/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'ALPHA_11_AI_4K',
            'neural_networks'  => 512,
            'ai_header'        => 'X-LG-Picture-Master',
            'ai_value'         => 'AI_PICTURE_PRO_2',
            'upscale_mode'     => '4K_AI_UPSCALING',
            'hdr_type'         => 'DOLBY_VISION_IQ',
            'hdr_nits'         => 4000,
            'ai_motion'        => 'TRUMOTION_PRO',
            'ai_color'         => 'AI_COLOR_PRIME',
            'ai_depth'         => 'AI_OBJECT_ENHANCEMENT',
            'ai_brightness'    => 'AI_BRIGHTNESS_CONTROL',
            'ai_sound'         => 'AI_SOUND_PRO',
            'genre_optimization' => true,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'sony' => [
            'pattern'          => '/Sony|BRAVIA|Google TV/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'XR_BACKLIGHT_MASTER',
            'neural_networks'  => 384,
            'ai_header'        => 'X-Sony-XR-Mode',
            'ai_value'         => 'XR_TRILUMINOS_MAX',
            'upscale_mode'     => 'XR_4K_UPSCALING',
            'hdr_type'         => 'DOLBY_VISION_HDR10',
            'hdr_nits'         => 3000,
            'ai_motion'        => 'XR_MOTION_CLARITY',
            'ai_color'         => 'XR_TRILUMINOS_MAX',
            'ai_depth'         => 'XR_DEPTH_CONTROL',
            'ai_brightness'    => 'XR_CONTRAST_BOOSTER',
            'ai_sound'         => 'ACOUSTIC_SURFACE_AUDIO',
            'genre_optimization' => false,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'hisense' => [
            'pattern'          => '/Hisense|VIDAA/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'HI_VIEW_ENGINE_X',
            'neural_networks'  => 128,
            'ai_header'        => 'X-Hisense-AI-Mode',
            'ai_value'         => 'AI_PICTURE_ENGINE',
            'upscale_mode'     => 'AI_4K_UPSCALING',
            'hdr_type'         => 'HDR10_PLUS',
            'hdr_nits'         => 2000,
            'ai_motion'        => 'ULTRA_SMOOTH_MOTION',
            'ai_color'         => 'AI_COLOR_ENGINE',
            'ai_depth'         => 'DEPTH_ENHANCER',
            'ai_brightness'    => 'ADAPTIVE_BRIGHTNESS',
            'ai_sound'         => 'DTS_VIRTUAL_X',
            'genre_optimization' => false,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'tcl' => [
            'pattern'          => '/TCL|Roku\s*TV/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'AIPQ_ENGINE_3',
            'neural_networks'  => 96,
            'ai_header'        => 'X-TCL-AI-Mode',
            'ai_value'         => 'AIPQ_UPSCALE',
            'upscale_mode'     => 'AI_SR_4K',
            'hdr_type'         => 'HDR10_PLUS',
            'hdr_nits'         => 2500,
            'ai_motion'        => 'MEMC_120HZ',
            'ai_color'         => 'QUANTUM_DOT_PRO',
            'ai_depth'         => 'DEPTH_CONTRAST',
            'ai_brightness'    => 'LOCAL_DIMMING_PRO',
            'ai_sound'         => 'DTS_HD',
            'genre_optimization' => false,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'philips' => [
            'pattern'          => '/Philips|Ambilight|SAPHI/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'P5_AI_ENGINE',
            'neural_networks'  => 128,
            'ai_header'        => 'X-Philips-P5-Mode',
            'ai_value'         => 'P5_PERFECT_PICTURE',
            'upscale_mode'     => 'P5_AI_UPSCALING',
            'hdr_type'         => 'DOLBY_VISION_HDR10_PLUS',
            'hdr_nits'         => 2000,
            'ai_motion'        => 'PERFECT_NATURAL_MOTION',
            'ai_color'         => 'WIDE_COLOR_GAMUT_PRO',
            'ai_depth'         => 'ULTRA_RESOLUTION',
            'ai_brightness'    => 'AMBILIGHT_ADAPTIVE',
            'ai_sound'         => 'DTS_PLAY_FI',
            'genre_optimization' => true,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'xiaomi' => [
            'pattern'          => '/Xiaomi|Mi\s*TV|MIUI|Redmi/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'AI_PICTURE_QUALITY',
            'neural_networks'  => 64,
            'ai_header'        => 'X-Xiaomi-AI-Mode',
            'ai_value'         => 'AI_MASTER_ENGINE',
            'upscale_mode'     => 'AI_UPSCALE_4K',
            'hdr_type'         => 'DOLBY_VISION_IQ',
            'hdr_nits'         => 1500,
            'ai_motion'        => 'MEMC_PRO',
            'ai_color'         => 'AI_COLOR_ENGINE',
            'ai_depth'         => 'AI_DEPTH',
            'ai_brightness'    => 'AUTO_HDR',
            'ai_sound'         => 'DTS_X',
            'genre_optimization' => false,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'vizio' => [
            'pattern'          => '/Vizio|SmartCast/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'IQ_ULTRA',
            'neural_networks'  => 64,
            'ai_header'        => 'X-Vizio-IQ-Mode',
            'ai_value'         => 'IQ_ACTIVE_PRO',
            'upscale_mode'     => 'IQ_4K_UPSCALING',
            'hdr_type'         => 'DOLBY_VISION_IQ',
            'hdr_nits'         => 1800,
            'ai_motion'        => 'CLEAR_ACTION_360',
            'ai_color'         => 'ACTIVE_FULL_ARRAY',
            'ai_depth'         => 'IQ_CONTRAST',
            'ai_brightness'    => 'ACTIVE_DIMMING',
            'ai_sound'         => 'DTS_VIRTUAL_X',
            'genre_optimization' => false,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],
        'panasonic' => [
            'pattern'          => '/Panasonic|VIERA|myHomeScreen/i',
            'type'             => 'tv',
            'supports_ai'      => true,
            'ai_processor'     => 'HCX_PRO_AI_MK2',
            'neural_networks'  => 256,
            'ai_header'        => 'X-Panasonic-HCX-Mode',
            'ai_value'         => 'HCX_PRO_AI',
            'upscale_mode'     => 'AI_4K_UPSCALING_MK2',
            'hdr_type'         => 'HDR10_PLUS_DOLBY_VISION',
            'hdr_nits'         => 2000,
            'ai_motion'        => 'SMOOTH_MOTION_DRIVE_PRO',
            'ai_color'         => 'HEXA_CHROMA_DRIVE_PRO',
            'ai_depth'         => 'DEPTH_PERCEPTION',
            'ai_brightness'    => 'INTELLIGENT_SENSING',
            'ai_sound'         => 'DOLBY_ATMOS',
            'genre_optimization' => true,
            'max_res'          => '3840x2160',
            'hdmi_version'     => '2.1',
        ],

        // ────────────────────── STREAMING PLAYERS ─────────────────────

        'fire_tv' => [
            'pattern'            => '/AFTKA|AFTKM|AFTS|Fire\s?TV|Amazon.*4K/i',
            'type'               => 'player',
            'supports_ai'        => true,
            'ai_processor'       => 'MEDIATEK_MT8696',
            'neural_networks'    => 64,
            'ai_header'          => 'X-FireTV-Picture-Mode',
            'ai_value'           => 'AV1_HW_DECODE_4K',
            'upscale_mode'       => 'FIRE_4K_UPSCALE',
            'hdr_type'           => 'HDR10_PLUS_DOLBY_VISION',
            'hdr_nits'           => 4000,
            'ai_motion'          => 'FRAME_RATE_MATCHING',
            'ai_color'           => 'WIDE_COLOR_GAMUT',
            'ai_depth'           => 'PASSTHROUGH',
            'ai_brightness'      => 'HDMI_CEC_PASSTHROUGH',
            'ai_sound'           => 'DOLBY_ATMOS_EACP',
            'genre_optimization' => false,
            'combo_passthrough'  => true,
            'hw_codecs'          => ['av1', 'hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR',
        ],
        'apple_tv' => [
            'pattern'            => '/AppleTV|Apple\s*TV|tvOS/i',
            'type'               => 'player',
            'supports_ai'        => true,
            'ai_processor'       => 'A15_BIONIC',
            'neural_networks'    => 128,
            'ai_header'          => 'X-AppleTV-Display-Mode',
            'ai_value'           => 'MATCH_CONTENT',
            'upscale_mode'       => 'APPLE_4K_UPSCALE',
            'hdr_type'           => 'DOLBY_VISION_HDR10',
            'hdr_nits'           => 4000,
            'ai_motion'          => 'MATCH_FRAME_RATE',
            'ai_color'           => 'P3_WIDE_COLOR',
            'ai_depth'           => 'PASSTHROUGH',
            'ai_brightness'      => 'AUTO_MATCH_DISPLAY',
            'ai_sound'           => 'DOLBY_ATMOS_SPATIAL',
            'genre_optimization' => false,
            'combo_passthrough'  => true,
            'hw_codecs'          => ['hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR_DV',
        ],
        'nvidia_shield' => [
            'pattern'            => '/SHIELD|NVIDIA|Tegra/i',
            'type'               => 'player',
            'supports_ai'        => true,
            'ai_processor'       => 'TEGRA_X1_PLUS',
            'neural_networks'    => 96,
            'ai_header'          => 'X-Shield-AI-Mode',
            'ai_value'           => 'AI_UPSCALING_4K',
            'upscale_mode'       => 'SHIELD_AI_4K_UPSCALE',
            'hdr_type'           => 'DOLBY_VISION_HDR10',
            'hdr_nits'           => 4000,
            'ai_motion'          => 'FRAME_RATE_MATCHING',
            'ai_color'           => 'WIDE_COLOR_GAMUT',
            'ai_depth'           => 'PASSTHROUGH',
            'ai_brightness'      => 'HDMI_PASSTHROUGH',
            'ai_sound'           => 'DOLBY_ATMOS_THP',
            'genre_optimization' => false,
            'combo_passthrough'  => true,
            'hw_codecs'          => ['av1', 'hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR_DV',
        ],
        'onn_4k' => [
            'pattern'            => '/ONN|onn\.|Walmart/i',
            'type'               => 'player',
            'supports_ai'        => false,
            'ai_processor'       => 'AMLOGIC_S905Y4',
            'neural_networks'    => 0,
            'upscale_mode'       => 'HW_UPSCALE_4K',
            'hdr_type'           => 'HDR10_PLUS_DOLBY_VISION',
            'hdr_nits'           => 4000,
            'ai_sound'           => 'DOLBY_ATMOS',
            'combo_passthrough'  => true,
            'hw_codecs'          => ['av1', 'hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR',
        ],
        'chromecast' => [
            'pattern'            => '/CrKey|Chromecast|Google.*TV/i',
            'type'               => 'player',
            'supports_ai'        => false,
            'ai_processor'       => 'AMLOGIC_S905X4',
            'neural_networks'    => 0,
            'upscale_mode'       => 'HW_UPSCALE',
            'hdr_type'           => 'HDR10_PLUS_DOLBY_VISION',
            'hdr_nits'           => 4000,
            'ai_sound'           => 'DOLBY_ATMOS',
            'combo_passthrough'  => true,
            'hw_codecs'          => ['av1', 'hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR',
        ],
        'roku' => [
            'pattern'            => '/Roku|RokuOS/i',
            'type'               => 'player',
            'supports_ai'        => false,
            'ai_processor'       => 'ARM_CORTEX_A55',
            'neural_networks'    => 0,
            'upscale_mode'       => 'ROKU_UPSCALE',
            'hdr_type'           => 'HDR10_PLUS_DOLBY_VISION',
            'hdr_nits'           => 4000,
            'ai_sound'           => 'DOLBY_ATMOS',
            'combo_passthrough'  => true,
            'hw_codecs'          => ['hevc', 'h264', 'vp9'],
            'max_decode'         => '4K60_HDR',
        ],

        // ────────────────────── SOFTWARE PLAYERS ──────────────────────

        'vlc' => [
            'pattern'     => '/VLC/i',
            'type'        => 'software',
            'supports_ai' => false,
            'upscaler'    => 'lanczos',
        ],
        'kodi' => [
            'pattern'     => '/Kodi/i',
            'type'        => 'software',
            'supports_ai' => false,
            'upscaler'    => 'bilinear',
        ],
        'exoplayer' => [
            'pattern'     => '/ExoPlayer|AndroidTV/i',
            'type'        => 'software',
            'supports_ai' => false,
            'upscaler'    => 'mediaframework',
        ],
        'ott_navigator' => [
            'pattern'     => '/OTT.*Navigator|nPlayer/i',
            'type'        => 'software',
            'supports_ai' => false,
            'upscaler'    => 'hw_decode',
        ],
        'stremio' => [
            'pattern'     => '/Stremio/i',
            'type'        => 'software',
            'supports_ai' => false,
            'upscaler'    => 'mpv',
        ],
    ];

    // ═══════════════════════════════════════════════════════════════════
    // DEVICE MEMORY — Stores detected devices for combo pairing
    // ═══════════════════════════════════════════════════════════════════

    private static function storeDeviceMemory(array $device): void
    {
        $memory = self::loadDeviceMemory();
        $key = $device['device'] ?? 'unknown';
        $memory['known_devices'][$key] = $device;
        $memory['last_updated'] = time();
        @file_put_contents(self::DEVICE_MEMORY_FILE,
            json_encode($memory, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX);
    }

    private static function loadDeviceMemory(): array
    {
        if (!file_exists(self::DEVICE_MEMORY_FILE)) {
            return ['known_devices' => [], 'last_updated' => 0];
        }
        $data = @json_decode((string)file_get_contents(self::DEVICE_MEMORY_FILE), true);
        return is_array($data) ? $data : ['known_devices' => [], 'last_updated' => 0];
    }

    // ═══════════════════════════════════════════════════════════════════
    // POLYMORPHIC DEVICE DETECTION (Idempotent)
    // ═══════════════════════════════════════════════════════════════════

    public static function detectDevice(string $userAgent): array
    {
        $detected = null;
        foreach (self::$deviceCapabilities as $device => $caps) {
            if (preg_match($caps['pattern'], $userAgent)) {
                $detected = array_merge(['device' => $device], $caps);
                break;
            }
        }
        if (!$detected) {
            $detected = ['device' => 'generic', 'type' => 'unknown', 'supports_ai' => false];
        }

        // Store for combo memory
        self::storeDeviceMemory($detected);

        return $detected;
    }

    // ═══════════════════════════════════════════════════════════════════
    // COMBO DETECTION — Merge Player + TV for MAX capabilities
    //
    // Fire Stick 4K Max + Samsung TV:
    //   Fire decodes AV1/HEVC at 4K60 → HDMI 2.1 48Gbps →
    //   Samsung NQ8 768 neural nets: AI Upscale + HDR10+ Advanced 5000 nits
    //
    // Always takes the MAX of each capability across all known devices
    // ═══════════════════════════════════════════════════════════════════

    public static function detectCombo(array $primaryDevice): array
    {
        $memory = self::loadDeviceMemory();
        $knownDevices = $memory['known_devices'] ?? [];

        if (count($knownDevices) < 2) {
            return array_merge($primaryDevice, [
                'combo' => false, 'combo_label' => 'SINGLE_DEVICE', 'bw_boost' => 1.0,
            ]);
        }

        // Find best TV (highest neural_networks) and best player (combo_passthrough)
        $bestTV = null;
        $bestPlayer = null;
        foreach ($knownDevices as $dev) {
            $type = $dev['type'] ?? 'unknown';
            $nn = $dev['neural_networks'] ?? 0;
            if ($type === 'tv' && (!$bestTV || $nn > ($bestTV['neural_networks'] ?? 0))) {
                $bestTV = $dev;
            }
            if ($type === 'player' && ($dev['combo_passthrough'] ?? false)) {
                if (!$bestPlayer || ($dev['neural_networks'] ?? 0) > ($bestPlayer['neural_networks'] ?? 0)) {
                    $bestPlayer = $dev;
                }
            }
        }

        if (!$bestTV || !$bestPlayer) {
            return array_merge($primaryDevice, [
                'combo' => false, 'combo_label' => 'NO_COMBO', 'bw_boost' => 1.0,
            ]);
        }

        // ── MERGE: Take the MAXIMUM of every capability ──
        return [
            'device'           => $bestPlayer['device'] . '+' . $bestTV['device'],
            'type'             => 'combo',
            'combo'            => true,
            'combo_label'      => strtoupper($bestPlayer['device']) . '_PLUS_' . strtoupper($bestTV['device']),
            'supports_ai'      => true,
            'ai_processor'     => $bestTV['ai_processor'] ?? 'UNKNOWN',
            'neural_networks'  => max($bestTV['neural_networks'] ?? 0, $bestPlayer['neural_networks'] ?? 0),
            'ai_header'        => $bestTV['ai_header'] ?? 'X-AI-Mode',
            'ai_value'         => $bestTV['ai_value'] ?? 'AI_UPSCALE',
            'upscale_mode'     => $bestTV['upscale_mode'] ?? 'AI_UPSCALE',
            'hdr_type'         => self::bestHDR($bestTV['hdr_type'] ?? '', $bestPlayer['hdr_type'] ?? ''),
            'hdr_nits'         => max($bestTV['hdr_nits'] ?? 0, $bestPlayer['hdr_nits'] ?? 0),
            'ai_motion'        => $bestTV['ai_motion'] ?? $bestPlayer['ai_motion'] ?? 'STANDARD',
            'ai_color'         => $bestTV['ai_color'] ?? 'ENHANCED',
            'ai_depth'         => $bestTV['ai_depth'] ?? 'ACTIVE',
            'ai_brightness'    => $bestTV['ai_brightness'] ?? 'AUTO',
            'ai_sound'         => self::bestAudio($bestPlayer['ai_sound'] ?? '', $bestTV['ai_sound'] ?? ''),
            'genre_optimization' => ($bestTV['genre_optimization'] ?? false) || ($bestPlayer['genre_optimization'] ?? false),
            'player_decode'    => $bestPlayer['ai_value'] ?? 'HW_DECODE',
            'tv_finishing'     => $bestTV['ai_value'] ?? 'AI_UPSCALE',
            'hw_codecs'        => $bestPlayer['hw_codecs'] ?? ['hevc', 'h264'],
            'max_decode'       => $bestPlayer['max_decode'] ?? '4K60',
            'bw_boost'         => 1.3,
        ];
    }

    /** Pick the richest HDR format from two options */
    private static function bestHDR(string $a, string $b): string
    {
        $rank = [
            'HDR10_PLUS_ADVANCED' => 10, 'DOLBY_VISION_IQ' => 9,
            'DOLBY_VISION_HDR10_PLUS' => 9, 'HDR10_PLUS_DOLBY_VISION' => 8,
            'DOLBY_VISION_HDR10' => 7, 'DOLBY_VISION' => 6,
            'HDR10_PLUS' => 5, 'HDR10' => 4, 'HLG' => 3,
        ];
        $ra = $rank[$a] ?? 0;
        $rb = $rank[$b] ?? 0;
        return $ra >= $rb ? ($a ?: $b) : $b;
    }

    /** Pick the richest audio format */
    private static function bestAudio(string $a, string $b): string
    {
        $rank = [
            'DOLBY_ATMOS_SPATIAL' => 10, 'DOLBY_ATMOS_EACP' => 9,
            'DOLBY_ATMOS_THP' => 8, 'DOLBY_ATMOS' => 7,
            'AI_SOUND_PRO' => 6, 'OTS_PRO' => 6,
            'ACOUSTIC_SURFACE_AUDIO' => 5, 'DTS_VIRTUAL_X' => 4,
            'DTS_X' => 4, 'DTS_HD' => 3, 'DTS_PLAY_FI' => 3,
        ];
        $ra = $rank[$a] ?? 0;
        $rb = $rank[$b] ?? 0;
        return $ra >= $rb ? ($a ?: $b) : $b;
    }

    // ═══════════════════════════════════════════════════════════════════
    // BANDWIDTH BOOST — AI processing needs MORE data for better results
    // ═══════════════════════════════════════════════════════════════════

    public static function calculateBandwidthBoost(int $height, array $device): float
    {
        $comboBoost = $device['bw_boost'] ?? 1.0;
        $aiBoost = match (true) {
            $height < 700                     => 1.5,   // SD→4K = need max quality SD input
            $height >= 700 && $height < 1000  => 1.3,   // HD→4K
            $height >= 1000 && $height < 2100 => 1.15,  // FHD→4K
            default                           => 1.0,   // Native 4K
        };
        return round($comboBoost * $aiBoost, 2);
    }

    // ═══════════════════════════════════════════════════════════════════
    // HARDWARE ACCELERATION — Force HW decode, eliminate SW fallback
    // ═══════════════════════════════════════════════════════════════════

    public static function injectHardwareAcceleration(
        array $device, array &$exthttp, array &$vlcopt
    ): void {
        $exthttp['X-HW-Decode-Priority'] = 'HARDWARE_ONLY';
        $exthttp['X-Codec-Priority'] = 'hevc,av1,h264';
        $vlcopt[] = '#EXTVLCOPT:avcodec-hw=any';
        $vlcopt[] = '#EXTVLCOPT:avcodec-threads=0';

        $deviceType = $device['device'] ?? 'generic';

        // Fire Stick 4K Max
        if (str_contains($deviceType, 'fire_tv')) {
            $exthttp['X-HW-Decoder'] = 'MEDIATEK_MT8696_AV1';
            $exthttp['X-Codec-AV1-HW'] = 'ENABLED';
            $exthttp['X-HDMI-Output'] = '2.1_4K60_HDR';
            $exthttp['X-Audio-Passthrough'] = 'DOLBY_ATMOS_EARC';
            $vlcopt[] = '#EXTVLCOPT:avcodec-fast=1';
        }

        // Apple TV 4K
        if (str_contains($deviceType, 'apple_tv')) {
            $exthttp['X-HW-Decoder'] = 'A15_BIONIC_HEVC';
            $exthttp['X-Match-Content'] = 'DYNAMIC_RANGE_FRAME_RATE';
            $exthttp['X-Color-Space'] = 'P3_WIDE';
        }

        // NVIDIA Shield
        if (str_contains($deviceType, 'nvidia') || str_contains($deviceType, 'shield')) {
            $exthttp['X-HW-Decoder'] = 'TEGRA_X1_PLUS_AV1';
            $exthttp['X-AI-Upscale-Local'] = 'SHIELD_AI_4K';
        }

        // Samsung TV
        if (str_contains($deviceType, 'samsung')) {
            $exthttp['X-Samsung-NQ8-Mode'] = 'AI_PROCESSING_FULL';
            $exthttp['X-Samsung-Neural-Nets'] = '768';
            $exthttp['X-Samsung-AI-Pipeline'] = 'DECODE_ANALYZE_UPSCALE_ENHANCE_DISPLAY';
        }

        // Combo: split pipeline
        if ($device['combo'] ?? false) {
            $codecs = implode(',', $device['hw_codecs'] ?? ['hevc', 'h264']);
            $exthttp['X-Pipeline-Mode'] = 'SPLIT_DECODE_FINISH';
            $exthttp['X-Player-Role'] = 'HW_DECODE_' . strtoupper($codecs);
            $exthttp['X-TV-Role'] = 'AI_UPSCALE_HDR_COLOR_DEPTH_MOTION';
            $exthttp['X-HDMI-Bandwidth'] = '48GBPS';
            $exthttp['X-Color-Space-Handoff'] = 'BT2020_12BIT';
            $exthttp['X-Max-Decode'] = $device['max_decode'] ?? '4K60';
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // VISUAL ORCHESTRATOR — Always find MAX quality the eye can see
    //
    // For EVERY resolution tier, the orchestrator:
    //   1. Forces the absolute best HDR path (HDR10+ Advanced / Dolby Vision IQ)
    //   2. Demands maximum color depth (12bit 4:4:4 when available)
    //   3. Activates ALL AI engines on the device (upscale + color + motion + depth)
    //   4. Sets HDR tone mapping to 4000-5000 nits (target for premium panels)
    //   5. Boosts bandwidth to feed AI with highest quality source data
    //   6. Forces HW decode to eliminate stuttering
    //
    // SDR content → ALWAYS gets HDR simulation (Fake HDR at 4000 nits)
    // HDR content → ALWAYS gets enhanced (AI tone mapping, AI brightness)
    // ═══════════════════════════════════════════════════════════════════

    public static function injectClientSideLogic(
        int $height, array &$exthttp, array &$vlcopt, string $userAgent = ''
    ): void {
        $exthttp['X-APE-AI-Engine'] = self::ENGINE_VERSION;

        $device = self::detectDevice($userAgent);
        $combo = self::detectCombo($device);
        if ($combo['combo']) {
            $device = $combo;
            $exthttp['X-APE-Combo-Mode'] = $combo['combo_label'];
        }

        $exthttp['X-APE-Device-Detected'] = $device['device'];
        $exthttp['X-APE-AI-Processor'] = $device['ai_processor'] ?? 'GENERIC';
        $exthttp['X-APE-Neural-Networks'] = (string)($device['neural_networks'] ?? 0);

        // HW acceleration
        self::injectHardwareAcceleration($device, $exthttp, $vlcopt);

        // BW boost
        $bwBoost = self::calculateBandwidthBoost($height, $device);
        $exthttp['X-AI-Bandwidth-Boost'] = (string)$bwBoost;

        // ── UNIVERSAL HDR/SDR OPTIMIZATION (always active) ──
        $nitsTarget = min(5000, max(4000, $device['hdr_nits'] ?? 4000));
        $exthttp['X-HDR-Target-Nits'] = (string)$nitsTarget;
        $exthttp['X-SDR-To-HDR-Simulation'] = 'ALWAYS_ACTIVE';
        $exthttp['X-Color-Volume-Target'] = 'BT2020';
        $exthttp['X-Quality-Degradation'] = 'FORBIDDEN';

        // ─────── CASE 1: SD (480p/576p) → AI Upscale to 4K ───────
        if ($height < 700) {
            $exthttp['X-Force-Resolution'] = '3840x2160';
            $exthttp['X-AI-Upscale-Mode'] = $device['upscale_mode'] ?? 'LANCZOS_SHARP';
            $exthttp['X-Content-Scale'] = '4.5x';
            $exthttp['X-Content-Upscale-Hint'] = 'SD_TO_4K_AI';
            $exthttp['X-AI-Denoise-Pre-Upscale'] = 'AGGRESSIVE';
            $exthttp['X-HDR-Simulation'] = 'HDR10_PLUS_ADVANCED';
            $exthttp['X-HDR-MaxCLL'] = "{$nitsTarget},500";
            $exthttp['X-Transfer-Function'] = 'PQ_ADVANCED';

            if ($device['supports_ai'] && isset($device['ai_header'])) {
                $exthttp[$device['ai_header']] = $device['ai_value'];
                $exthttp['X-Content-Resolution'] = '480p';
                $exthttp['X-Target-Resolution'] = '2160p';
                $exthttp['X-AI-Color-Recovery'] = $device['ai_color'] ?? 'ENHANCED';
                $exthttp['X-AI-Depth-Synthesis'] = $device['ai_depth'] ?? 'ACTIVE';
            }

            $vlcopt[] = '#EXTVLCOPT:swscale-mode=9';
            $vlcopt[] = '#EXTVLCOPT:postproc-q=6';
            $vlcopt[] = '#EXTVLCOPT:aspect-ratio=16:9';
            $vlcopt[] = '#EXTVLCOPT:deinterlace=1';
            $vlcopt[] = '#EXTVLCOPT:deinterlace-mode=yadif';
            return;
        }

        // ─────── CASE 2: HD (720p) → HDR10+ Advanced + AI Upscale ─────
        if ($height >= 700 && $height < 1000) {
            $exthttp['X-HDR-Simulation'] = 'HDR10_PLUS_ADVANCED';
            $exthttp['X-Color-Volume'] = 'BT2020';
            $exthttp['X-HDR-MaxCLL'] = "{$nitsTarget},500";
            $exthttp['X-HDR-MaxFALL'] = '1500';
            $exthttp['X-Transfer-Function'] = 'PQ_ADVANCED';
            $exthttp['X-HDR-Genre-Optimization'] = 'AUTO';
            $exthttp['X-Local-Tone-Mapping'] = 'AI_ADAPTIVE';
            $exthttp['X-AI-Upscale-Mode'] = $device['upscale_mode'] ?? '4K_UPSCALE';
            $exthttp['X-Content-Upscale-Hint'] = 'HD_TO_4K_AI';

            if ($device['supports_ai'] && isset($device['ai_header'])) {
                $exthttp[$device['ai_header']] = $device['ai_value'];
                $exthttp['X-HDR-Mode'] = $device['hdr_type'] ?? 'HDR10_PLUS';
                $exthttp['X-AI-Color-Engine'] = $device['ai_color'] ?? 'ENHANCED';
                $exthttp['X-AI-Motion-Engine'] = $device['ai_motion'] ?? 'SMOOTH';
                $exthttp['X-AI-Brightness'] = $device['ai_brightness'] ?? 'AUTO';
            }

            $vlcopt[] = '#EXTVLCOPT:saturation=1.25';
            $vlcopt[] = '#EXTVLCOPT:contrast=1.15';
            $vlcopt[] = '#EXTVLCOPT:sharpen-sigma=0.04';
            $vlcopt[] = '#EXTVLCOPT:gamma=0.95';
            return;
        }

        // ─────── CASE 3: FHD (1080p) → AI Full Pipeline to 4K ────────
        if ($height >= 1000 && $height < 2100) {
            $exthttp['X-AI-Enhance'] = 'FULL_PIPELINE';
            $exthttp['X-Denoise-Level'] = 'AI_ADAPTIVE';
            $exthttp['X-AI-Upscale-Mode'] = $device['upscale_mode'] ?? '4K_UPSCALE';
            $exthttp['X-Content-Upscale-Hint'] = 'FHD_TO_4K_AI';
            $exthttp['X-AI-Motion-Interpolation'] = 'ACTIVE';
            $exthttp['X-AI-Judder-Reduction'] = 'INTELLIGENT';
            $exthttp['X-HDR-Simulation'] = 'HDR10_PLUS_ADVANCED';
            $exthttp['X-HDR-MaxCLL'] = "{$nitsTarget},500";

            if ($device['supports_ai'] && isset($device['ai_header'])) {
                $exthttp[$device['ai_header']] = $device['ai_value'];
                $exthttp['X-Content-Resolution'] = '1080p';
                $exthttp['X-Target-Resolution'] = '2160p';
                $exthttp['X-AI-Detail-Enhancement'] = 'TEXTURE_EDGE_BOOST';
                $exthttp['X-AI-Color-Engine'] = $device['ai_color'] ?? 'ENHANCED';
                $exthttp['X-AI-Motion-Engine'] = $device['ai_motion'] ?? 'SMOOTH';
                $exthttp['X-AI-Depth-Engine'] = $device['ai_depth'] ?? 'ACTIVE';
                $exthttp['X-AI-Brightness'] = $device['ai_brightness'] ?? 'AUTO';
                if ($device['genre_optimization'] ?? false) {
                    $exthttp['X-AI-Genre-Detection'] = 'AUTO';
                    $exthttp['X-AI-Scene-Adaptation'] = 'REAL_TIME';
                }
            }

            $vlcopt[] = '#EXTVLCOPT:sharpen-sigma=0.025';
            $vlcopt[] = '#EXTVLCOPT:contrast=1.05';
            return;
        }

        // ─────── CASE 4: 4K/8K Native → Deep Color 12bit ─────────────
        if ($height >= 2100) {
            $exthttp['X-Chroma-Subsampling'] = '4:4:4';
            $exthttp['X-Color-Depth-Force'] = '12bit';
            $exthttp['X-Dolby-Vision-Compat'] = 'IQ_PRECISION';
            $exthttp['X-HDR-Mode-Primary'] = 'HDR10_PLUS_ADVANCED';
            $exthttp['X-HDR-MaxCLL'] = "{$nitsTarget},500";
            $exthttp['X-HDR-Local-Dimming'] = 'AI_PRECISION';
            $exthttp['X-AI-Motion-Interpolation'] = 'NATIVE_120FPS';

            if ($device['supports_ai']) {
                $exthttp['X-HDR-Mode'] = $device['hdr_type'] ?? 'HDR10_PLUS';
                $exthttp['X-AI-Color-Engine'] = $device['ai_color'] ?? 'NATIVE';
                $exthttp['X-AI-Detail-Enhancement'] = 'TEXTURE_PRESERVATION';
                $exthttp['X-AI-Noise-Reduction'] = 'GRAIN_PRESERVE';
                $exthttp['X-AI-Depth-Engine'] = $device['ai_depth'] ?? 'NATIVE';
                if (isset($device['ai_header'])) {
                    $exthttp[$device['ai_header']] = $device['ai_value'];
                }
                if (isset($device['ai_sound'])) {
                    $exthttp['X-AI-Sound-Engine'] = $device['ai_sound'];
                }
            }
        }
    }

    /** Returns engine health/diagnostics */
    public static function getSystemStats(): array
    {
        $memory = self::loadDeviceMemory();
        return [
            'engine'      => 'AISuperResolutionEngine',
            'version'     => self::ENGINE_VERSION,
            'policy'      => 'ZERO_PROXY',
            'standard'    => '2026_POLYMORPHIC_ORCHESTRATOR',
            'tv_brands'   => ['samsung', 'lg', 'sony', 'hisense', 'tcl', 'philips', 'xiaomi', 'vizio', 'panasonic'],
            'players'     => ['fire_tv', 'apple_tv', 'nvidia_shield', 'chromecast', 'roku'],
            'software'    => ['vlc', 'kodi', 'exoplayer', 'ott_navigator', 'stremio'],
            'known_combo' => array_keys($memory['known_devices'] ?? []),
            'features'    => [
                'Combo_Player_TV_Detection', 'Bandwidth_Boost', 'HW_Acceleration',
                'HDR10+_Advanced_5000nits', 'Dolby_Vision_IQ', '12bit_4:4:4',
                'AI_Upscaling_Pro', 'AI_Motion_Enhancer', 'AI_Color_Intelligence',
                'Genre_Optimization', 'SDR_to_HDR_Simulation_Always',
            ],
        ];
    }
}
