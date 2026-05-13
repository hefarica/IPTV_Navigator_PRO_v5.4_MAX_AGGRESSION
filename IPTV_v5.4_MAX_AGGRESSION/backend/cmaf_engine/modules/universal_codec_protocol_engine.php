<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Universal Compatibility Layer
 * Module: Universal Codec & Protocol Engine v1.0.0
 *
 * FUNCIÓN: Selecciona el codec y protocolo óptimos para cada player,
 * garantizando reproducción en cualquier dispositivo del mundo.
 *
 * JERARQUÍA DE CODECS (de mayor a menor calidad):
 *   AV1  → Mejor compresión, soporte limitado (Chrome, Firefox, Shield, Fire TV 4K)
 *   HEVC → Alta calidad, soporte amplio (Android, iOS, Apple TV, Smart TV, VLC 3+)
 *   H.264 → Universal (todos los players sin excepción)
 *
 * JERARQUÍA DE PROTOCOLOS (de mayor a menor compatibilidad):
 *   HLS/fMP4  → Máxima calidad, soporte amplio (ExoPlayer, VLC 3+, Safari, Kodi 19+)
 *   HLS/TS    → Universal (todos los players incluyendo MAG, Roku, MPC-HC)
 *   DASH/MPD  → Mejor ABR, soporte variable (ExoPlayer, Chrome, Firefox, Shaka)
 *   TS Direct → Último recurso (MAG old, MPC-HC, players sin HLS)
 *
 * CODEC STRINGS RFC 6381 (para EXT-X-STREAM-INF CODECS=):
 *   H.264 Baseline L3.0: avc1.42E01E
 *   H.264 Main    L3.1:  avc1.4D401F
 *   H.264 High    L4.0:  avc1.640028
 *   H.264 High    L4.1:  avc1.640029
 *   H.264 High    L5.0:  avc1.640032
 *   HEVC Main:            hvc1.1.6.L93.B0
 *   HEVC Main 10:         hvc1.2.4.L120.B0
 *   AV1 Main:             av01.0.04M.08
 *   AAC-LC:               mp4a.40.2
 *   HE-AAC:               mp4a.40.5
 *   AC-3 (Dolby):         ac-3
 *   E-AC-3 (Dolby+):      ec-3
 */

class UniversalCodecProtocolEngine
{
    const ENGINE_VERSION = '1.0.0';

    // ─── Codec string constants (RFC 6381) ────────────────────────────────────
    const CODEC_H264_BASELINE = 'avc1.42E01E';
    const CODEC_H264_MAIN     = 'avc1.4D401F';
    const CODEC_H264_HIGH_40  = 'avc1.640028';
    const CODEC_H264_HIGH_41  = 'avc1.640029';
    const CODEC_H264_HIGH_50  = 'avc1.640032';
    const CODEC_HEVC_MAIN     = 'hvc1.1.6.L93.B0';
    const CODEC_HEVC_MAIN10   = 'hvc1.2.4.L120.B0';
    const CODEC_HEVC_HDR10    = 'hvc1.2.4.L150.B0';
    const CODEC_AV1_MAIN      = 'av01.0.04M.08';
    const CODEC_AV1_HIGH      = 'av01.0.08M.10';
    const CODEC_AAC_LC        = 'mp4a.40.2';
    const CODEC_HE_AAC        = 'mp4a.40.5';
    const CODEC_AC3           = 'ac-3';
    const CODEC_EAC3          = 'ec-3';

    // ─── Resolution → Bandwidth mapping ──────────────────────────────────────
    private static array $RESOLUTION_BANDWIDTH = [
        '3840x2160' => 20000000,  // 4K UHD
        '2560x1440' => 10000000,  // 2K QHD
        '1920x1080' => 5000000,   // 1080p FHD
        '1280x720'  => 2500000,   // 720p HD
        '854x480'   => 1200000,   // 480p SD
        '640x360'   => 600000,    // 360p
        '426x240'   => 300000,    // 240p
    ];

    /**
     * Select the optimal codec string for a player + channel combination.
     *
     * @param string $playerId    Player ID.
     * @param array  $channelDna  Channel DNA. May include 'codec_ladder' (LAB SSOT
     *                            from APE_ALL_PROFILES_v10_REALTIME_ENGINE.json).
     * @return array              ['video_codec' => string, 'audio_codec' => string,
     *                            'codec_string' => string, 'codec_ladder' => array|null]
     */
    public static function selectCodec(string $playerId, array $channelDna = []): array
    {
        $engine = new self();
        return $engine->resolveCodec($playerId, $channelDna);
    }

    /**
     * Generate EXT-X-STREAM-INF line with correct CODECS= attribute.
     *
     * @param string $playerId    Player ID.
     * @param array  $channelDna  Channel DNA.
     * @return string             #EXT-X-STREAM-INF line.
     */
    public static function generateStreamInf(string $playerId, array $channelDna = []): string
    {
        $engine = new self();
        return $engine->buildStreamInf($playerId, $channelDna);
    }

    private function resolveCodec(string $playerId, array $dna): array
    {
        // Channel DNA codec override
        $dnaCodec = strtolower($dna['codec'] ?? '');

        // Determine video codec based on player capability + DNA
        $videoCodec = $this->selectVideoCodec($playerId, $dnaCodec, $dna);
        $audioCodec = $this->selectAudioCodec($playerId, $dna);

        $codecString = $videoCodec . ',' . $audioCodec;

        // [HEVC-FIRST CODEC LADDER] Pass-through del codec_ladder LAB SSOT si el caller
        // lo proveyó vía $dna. Permite que consumers downstream emitan EXT-X-APE-CODEC-PRIORITY-*
        // tags y EXTVLCOPT/KODIPROP per-profile sin re-resolver. Null si no fue provisto.
        return [
            'video_codec'  => $videoCodec,
            'audio_codec'  => $audioCodec,
            'codec_string' => $codecString,
            'codec_ladder' => $dna['codec_ladder'] ?? null,
        ];
    }

    private function selectVideoCodec(string $playerId, string $dnaCodec, array $dna): string
    {
        // AV1 — only for players that support it
        $av1Players = ['Chrome', 'Firefox', 'ShakaPlayer', 'NVIDIA_SHIELD', 'Fire_TV',
                       'Stremio', 'MPV', 'VLC_3', 'Kodi_19', 'Plex'];
        if (($dnaCodec === 'av1') && in_array($playerId, $av1Players)) {
            return self::CODEC_AV1_MAIN;
        }

        // HEVC/H.265 — broad support
        $hevcPlayers = [
            'TiviMate', 'ExoPlayer', 'OTT_Navigator', 'IPTV_Smarters', 'GSE_Smart_IPTV',
            'Perfect_Player', 'MX_Player', 'IPTV_Extreme', 'Sparkle_TV', 'Televizo',
            'Kodi_19', 'Kodi_18', 'Plex', 'Emby', 'Jellyfin', 'Infuse', 'Channels_DVR',
            'Safari_iOS', 'Safari_macOS', 'Apple_TV', 'VLC_3', 'MPV', 'ShakaPlayer',
            'Samsung_Tizen', 'LG_webOS', 'Fire_TV', 'NVIDIA_SHIELD', 'Formuler',
            'Dreamlink', 'MAG_New',
        ];

        if (in_array($playerId, $hevcPlayers)) {
            // HDR10 HEVC
            if (!empty($dna['hdr_profile']) && in_array($dna['hdr_profile'], ['hdr10', 'hdr10plus', 'dolby_vision'])) {
                return self::CODEC_HEVC_HDR10;
            }
            // HEVC Main 10 for 10-bit content
            if (!empty($dna['bit_depth']) && $dna['bit_depth'] == 10) {
                return self::CODEC_HEVC_MAIN10;
            }
            return self::CODEC_HEVC_MAIN;
        }

        // H.264 — universal fallback
        $resolution = $dna['resolution'] ?? '1920x1080';
        return $this->selectH264Profile($resolution);
    }

    private function selectH264Profile(string $resolution): string
    {
        // Select H.264 profile based on resolution
        return match(true) {
            str_starts_with($resolution, '3840') => self::CODEC_H264_HIGH_50,  // 4K
            str_starts_with($resolution, '1920') => self::CODEC_H264_HIGH_40,  // 1080p
            str_starts_with($resolution, '1280') => self::CODEC_H264_HIGH_40,  // 720p
            str_starts_with($resolution, '854')  => self::CODEC_H264_MAIN,     // 480p
            default                              => self::CODEC_H264_BASELINE,  // SD/Unknown
        };
    }

    private function selectAudioCodec(string $playerId, array $dna): string
    {
        $audioCodec = strtolower($dna['audio_codec'] ?? '');

        // Dolby AC-3/E-AC-3 for players that support it
        $dolbyPlayers = ['TiviMate', 'ExoPlayer', 'Kodi_19', 'Plex', 'Emby', 'Jellyfin',
                         'VLC_3', 'MPV', 'Apple_TV', 'Fire_TV', 'NVIDIA_SHIELD',
                         'Samsung_Tizen', 'LG_webOS', 'Infuse', 'Channels_DVR'];

        if (($audioCodec === 'eac3' || $audioCodec === 'ec3') && in_array($playerId, $dolbyPlayers)) {
            return self::CODEC_EAC3;
        }
        if (($audioCodec === 'ac3' || $audioCodec === 'ac-3') && in_array($playerId, $dolbyPlayers)) {
            return self::CODEC_AC3;
        }

        // HE-AAC for mobile players (better compression at low bitrates)
        $heAacPlayers = ['TiviMate', 'ExoPlayer', 'OTT_Navigator', 'IPTV_Smarters',
                         'MX_Player', 'Fire_TV', 'NVIDIA_SHIELD'];
        if (in_array($playerId, $heAacPlayers)) {
            return self::CODEC_HE_AAC;
        }

        // AAC-LC — universal default
        return self::CODEC_AAC_LC;
    }

    private function buildStreamInf(string $playerId, array $dna): string
    {
        $codec    = $this->resolveCodec($playerId, $dna);
        $resolution = $dna['resolution'] ?? '1920x1080';
        $bandwidth  = $dna['bandwidth'] ?? $this->estimateBandwidth($resolution, $codec['video_codec']);
        $frameRate  = $dna['frame_rate'] ?? '25';
        $scanType   = strtolower($dna['scan_type'] ?? 'progressive');

        $attrs = [
            'BANDWIDTH'  => $bandwidth,
            'CODECS'     => '"' . $codec['codec_string'] . '"',
            'RESOLUTION' => $resolution,
        ];

        // Add FRAME-RATE for 50/60fps content
        if (in_array($frameRate, ['50', '60', '59.94', '29.97', '30'])) {
            $attrs['FRAME-RATE'] = $frameRate;
        }

        // Add VIDEO-RANGE for HDR content
        if (!empty($dna['hdr_profile'])) {
            $attrs['VIDEO-RANGE'] = match($dna['hdr_profile']) {
                'hdr10', 'hdr10plus' => 'PQ',
                'hlg'                => 'HLG',
                default              => 'SDR',
            };
        }

        // Build attribute string
        $attrStr = implode(',', array_map(
            fn($k, $v) => "{$k}={$v}",
            array_keys($attrs),
            array_values($attrs)
        ));

        return "#EXT-X-STREAM-INF:{$attrStr}";
    }

    private function estimateBandwidth(string $resolution, string $videoCodec): int
    {
        $base = self::$RESOLUTION_BANDWIDTH[$resolution] ?? 5000000;

        // HEVC is ~50% more efficient than H.264
        if (str_starts_with($videoCodec, 'hvc1')) {
            $base = (int)($base * 0.5);
        }
        // AV1 is ~30% more efficient than HEVC
        if (str_starts_with($videoCodec, 'av01')) {
            $base = (int)($base * 0.35);
        }

        return $base;
    }

    /**
     * Get the MIME type for a given format.
     * Critical for Content-Type headers and KODIPROP:mimetype.
     */
    public static function getMimeType(string $format): string
    {
        return match($format) {
            'hls_fmp4', 'hls', 'cmaf' => 'application/x-mpegURL',
            'dash', 'mpd'             => 'application/dash+xml',
            'hls_ts', 'ts_direct'     => 'video/mp2t',
            default                   => 'application/x-mpegURL',
        };
    }

    /**
     * Get the file extension for a given format.
     */
    public static function getFileExtension(string $format): string
    {
        return match($format) {
            'hls_fmp4', 'hls', 'cmaf', 'hls_ts' => 'm3u8',
            'dash', 'mpd'                        => 'mpd',
            'ts_direct'                          => 'ts',
            default                              => 'm3u8',
        };
    }
}
