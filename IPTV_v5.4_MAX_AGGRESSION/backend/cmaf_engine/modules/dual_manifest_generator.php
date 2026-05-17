<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — CMAF Architecture Layer
 * Module: Dual Manifest Generator (DMG) v2.0.0
 *
 * GENERATES: HLS Master Playlist (.m3u8) + MPEG-DASH MPD (.mpd)
 * from a single set of CMAF fMP4 segments.
 *
 * LCEVC SIGNALING (REAL):
 *   HLS:  #EXT-X-APE-LCEVC-STATE:{STATE} + #EXT-X-APE-LCEVC-MODE:{MODE}
 *   DASH: <SupplementalProperty> + <EssentialProperty> in AdaptationSet
 *   LCEVC AdaptationSet: separate <AdaptationSet> for enhancement track
 *
 * LCEVC STATES: OFF | SIGNAL_ONLY | PACKAGED | PLAYER_VALIDATED
 */

class DualManifestGenerator
{
    const GENERATOR_VERSION = '2.0.0';

    const LCEVC_URN_SUPPLEMENTAL = 'urn:mpeg:lcevc:2021';
    const LCEVC_URN_ESSENTIAL    = 'urn:mpeg:lcevc:essential:2021';
    const LCEVC_CODEC_H264       = 'avc1.640028';
    const LCEVC_CODEC_HEVC       = 'hvc1.1.6.L120.B0';  // RFC 6381 §3.3 — Tier 9 cascada definitiva (constraint=B0, NOT .90)

    const STATE_OFF              = 'OFF';
    const STATE_SIGNAL_ONLY      = 'SIGNAL_ONLY';
    const STATE_PACKAGED         = 'PACKAGED';
    const STATE_PLAYER_VALIDATED = 'PLAYER_VALIDATED';

    const DASH_NAMESPACE     = 'urn:mpeg:dash:schema:mpd:2011';
    const DASH_PROFILE_LIVE  = 'urn:mpeg:dash:profile:isoff-live:2011';
    const DASH_PROFILE_VOD   = 'urn:mpeg:dash:profile:isoff-on-demand:2011';
    const HLS_VERSION_FMP4   = 7;

    /**
     * Main entry point. Generates both HLS and DASH manifests.
     *
     * @param string $outputPath  Filesystem path where manifests will be written.
     * @param array  $segmentMeta Segment metadata from CmafPackagingEngine.
     * @param array  $channelDna  Channel DNA from channels_map.json.
     * @param string $baseUrl     Public base URL for segments.
     * @return array              Result with status, hls_path, dash_path.
     */
    public static function generate(
        string $outputPath,
        array  $segmentMeta,
        array  $channelDna,
        string $baseUrl
    ): array {
        $generator = new self();
        return $generator->runGeneration($outputPath, $segmentMeta, $channelDna, $baseUrl);
    }

    private function runGeneration(
        string $outputPath,
        array  $segmentMeta,
        array  $channelDna,
        string $baseUrl
    ): array {
        $lcevcEnabled = !empty($channelDna['lcevc_enabled']);
        $lcevcState   = $segmentMeta['lcevc_state'] ?? self::STATE_OFF;
        $lcevcMode    = $channelDna['lcevc_mode']   ?? 'sei_metadata';

        $hlsContent = $this->generateHlsMaster($segmentMeta, $channelDna, $baseUrl, $lcevcEnabled, $lcevcState, $lcevcMode);
        $hlsPath    = $outputPath . '/master.m3u8';
        $hlsWritten = file_put_contents($hlsPath, $hlsContent);

        if ($hlsWritten === false) {
            return $this->buildResult('error', 'Failed to write HLS master playlist to: ' . $hlsPath);
        }

        foreach ($segmentMeta['renditions'] ?? [] as $rendition) {
            $rc = $this->generateHlsRenditionPlaylist($rendition, $baseUrl, $segmentMeta, $lcevcEnabled, $lcevcState);
            file_put_contents($outputPath . '/' . $rendition['label'] . '.m3u8', $rc);
        }

        $dashContent = $this->generateDashMpd($segmentMeta, $channelDna, $baseUrl, $lcevcEnabled, $lcevcState, $lcevcMode);
        $dashPath    = $outputPath . '/stream.mpd';
        $dashWritten = file_put_contents($dashPath, $dashContent);

        if ($dashWritten === false) {
            return $this->buildResult('error', 'Failed to write DASH MPD to: ' . $dashPath);
        }

        return $this->buildResult('success', 'Dual manifests generated successfully.', [
            'hls_path'      => $hlsPath,
            'dash_path'     => $dashPath,
            'hls_bytes'     => $hlsWritten,
            'dash_bytes'    => $dashWritten,
            'lcevc_state'   => $lcevcState,
            'lcevc_enabled' => $lcevcEnabled,
        ]);
    }

    private function generateHlsMaster(
        array $segmentMeta, array $channelDna, string $baseUrl,
        bool $lcevcEnabled, string $lcevcState, string $lcevcMode
    ): string {
        $lines = [
            '#EXTM3U',
            '#EXT-X-VERSION:' . self::HLS_VERSION_FMP4,
            '#EXT-X-INDEPENDENT-SEGMENTS',
        ];

        if ($lcevcEnabled) {
            $lines[] = '';
            $lines[] = '## APE LCEVC Enhancement Layer (MPEG-5 Part 2)';
            $lines[] = '#EXT-X-APE-LCEVC:ENABLED';
            $lines[] = '#EXT-X-APE-LCEVC-STATE:' . $lcevcState;
            $lines[] = '#EXT-X-APE-LCEVC-MODE:' . strtoupper($lcevcMode);
            $lines[] = '#EXT-X-APE-LCEVC-BASE-CODEC:' . strtoupper($channelDna['lcevc_base_codec'] ?? 'H264');
            $lines[] = '#EXT-X-APE-LCEVC-TRANSPORT:' . strtoupper($channelDna['lcevc_transport'] ?? 'EMBEDDED');
            $lines[] = '#EXT-X-APE-LCEVC-FALLBACK:' . strtoupper($channelDna['lcevc_fallback'] ?? 'BASE_ONLY');
            $lines[] = '#EXT-X-APE-LCEVC-PLAYER-REQUIRED:' . (!empty($channelDna['lcevc_player_required']) ? '1' : '0');
            $lines[] = '';
        }

        foreach ($segmentMeta['audio_tracks'] ?? [] as $idx => $audio) {
            $lang    = $audio['lang'] ?? 'spa';
            $label   = $audio['label'] ?? 'audio_default';
            $default = ($idx === 0) ? 'YES' : 'NO';
            $lines[] = '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",'
                . 'LANGUAGE="' . $lang . '",'
                . 'NAME="' . strtoupper($lang) . '",'
                . 'DEFAULT=' . $default . ','
                . 'AUTOSELECT=YES,'
                . 'URI="' . $baseUrl . '/' . $label . '.m3u8"';
        }
        $lines[] = '';

        $renditions = $segmentMeta['renditions'] ?? [];
        usort($renditions, fn($a, $b) => $b['bitrate'] - $a['bitrate']);

        // HDR signaling: emit VIDEO-RANGE=PQ|HLG only if probe evidence in DNA
        // Per CLAUDE.md "Reglas Honestas — NUNCA emitir sin evidencia"
        // Per ARTIFACT_HDR10_METADATA_TRIFECTA.md — VIDEO-RANGE is the canonical HLS attribute
        $videoRange = $this->resolveVideoRange($channelDna);

        foreach ($renditions as $rendition) {
            $codec      = $this->resolveHlsCodecString($rendition, $channelDna, $lcevcEnabled);
            $bandwidth  = ($rendition['bitrate'] + 128) * 1000;
            $avgBw      = (int)($bandwidth * 0.85);
            $resolution = $rendition['width'] . 'x' . $rendition['height'];

            $streamInf = '#EXT-X-STREAM-INF:'
                . 'BANDWIDTH=' . $bandwidth . ','
                . 'AVERAGE-BANDWIDTH=' . $avgBw . ','
                . 'CODECS="' . $codec . '",'
                . 'RESOLUTION=' . $resolution . ','
                . 'FRAME-RATE=25.000';

            // Append VIDEO-RANGE only if probe evidence confirmed HDR
            if ($videoRange !== null) {
                $streamInf .= ',VIDEO-RANGE=' . $videoRange;
            }

            $streamInf .= ',AUDIO="audio",CLOSED-CAPTIONS=NONE';
            $lines[] = $streamInf;
            $lines[] = $baseUrl . '/' . $rendition['label'] . '.m3u8';
        }

        return implode("\n", $lines) . "\n";
    }

    private function generateHlsRenditionPlaylist(
        array $rendition, string $baseUrl, array $segmentMeta,
        bool $lcevcEnabled, string $lcevcState
    ): string {
        $segDuration = $segmentMeta['seg_duration'] ?? 2;
        $isLive      = ($segmentMeta['profile'] ?? 'live') !== 'vod';
        $outputPath  = $segmentMeta['output_path'] ?? '';

        $lines = [
            '#EXTM3U',
            '#EXT-X-VERSION:' . self::HLS_VERSION_FMP4,
            '#EXT-X-TARGETDURATION:' . $segDuration,
            '#EXT-X-MEDIA-SEQUENCE:0',
        ];

        if (!$isLive) {
            $lines[] = '#EXT-X-PLAYLIST-TYPE:VOD';
        }
        if ($lcevcEnabled) {
            $lines[] = '#EXT-X-APE-LCEVC-STATE:' . $lcevcState;
        }

        $lines[] = '#EXT-X-MAP:URI="' . $baseUrl . '/init.mp4"';
        $lines[] = '';

        $segFiles = glob($outputPath . '/seg_*.m4s') ?: [];
        sort($segFiles);

        if (empty($segFiles)) {
            $lines[] = '## Live stream — segments will appear as they are produced';
        } else {
            foreach ($segFiles as $segFile) {
                $lines[] = '#EXTINF:' . number_format($segDuration, 6, '.', '') . ',';
                $lines[] = $baseUrl . '/' . basename($segFile);
            }
        }

        if (!$isLive) {
            $lines[] = '#EXT-X-ENDLIST';
        }

        return implode("\n", $lines) . "\n";
    }

    private function generateDashMpd(
        array $segmentMeta, array $channelDna, string $baseUrl,
        bool $lcevcEnabled, string $lcevcState, string $lcevcMode
    ): string {
        $segDuration = $segmentMeta['seg_duration'] ?? 2;
        $isLive      = ($segmentMeta['profile'] ?? 'live') !== 'vod';
        $dashProfile = $isLive ? self::DASH_PROFILE_LIVE : self::DASH_PROFILE_VOD;
        $mpdType     = $isLive ? 'dynamic' : 'static';
        $now         = gmdate('Y-m-d\TH:i:s\Z');
        $minBuf      = 'PT' . ($segDuration * 2) . 'S';

        $xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<MPD xmlns="' . self::DASH_NAMESPACE . '"' . "\n";
        $xml .= '     profiles="' . $dashProfile . '"' . "\n";
        $xml .= '     type="' . $mpdType . '"' . "\n";
        $xml .= '     minBufferTime="' . $minBuf . '"' . "\n";
        if ($isLive) {
            $xml .= '     availabilityStartTime="' . $now . '"' . "\n";
            $xml .= '     timeShiftBufferDepth="PT30S"' . "\n";
            $xml .= '     suggestedPresentationDelay="PT' . ($segDuration * 3) . 'S"' . "\n";
        }
        $xml .= '     publishTime="' . $now . '">' . "\n";
        $xml .= '  <Period id="0" start="PT0S">' . "\n";

        if ($lcevcEnabled) {
            $xml .= '    <!-- APE LCEVC Enhancement Layer (MPEG-5 Part 2 ISO/IEC 23094-2) -->' . "\n";
            $xml .= '    <SupplementalProperty schemeIdUri="' . self::LCEVC_URN_SUPPLEMENTAL . '"'
                . ' value="state=' . $lcevcState . ';mode=' . strtoupper($lcevcMode) . '" />' . "\n";
        }

        // Audio AdaptationSet
        $audioLang = $channelDna['audio_lang'] ?? 'spa';
        $xml .= '    <AdaptationSet id="1" contentType="audio" lang="' . $audioLang . '"'
            . ' mimeType="audio/mp4" codecs="mp4a.40.2"'
            . ' segmentAlignment="true" startWithSAP="1">' . "\n";
        $xml .= '      <SegmentTemplate timescale="48000"'
            . ' initialization="' . $baseUrl . '/init.mp4"'
            . ' media="' . $baseUrl . '/seg_$Number$.m4s"'
            . ' startNumber="0" duration="' . ($segDuration * 48000) . '" />' . "\n";
        foreach ($segmentMeta['audio_tracks'] ?? [] as $audio) {
            $xml .= '      <Representation id="' . ($audio['label'] ?? 'audio') . '"'
                . ' bandwidth="' . (($audio['bitrate'] ?? 128) * 1000) . '"'
                . ' audioSamplingRate="48000" />' . "\n";
        }
        $xml .= '    </AdaptationSet>' . "\n";

        // Video AdaptationSet
        $baseCodec  = $this->resolveDashCodecString($channelDna, false);
        $renditions = $segmentMeta['renditions'] ?? [];
        usort($renditions, fn($a, $b) => $b['bitrate'] - $a['bitrate']);
        $maxW = $renditions[0]['width']  ?? 1920;
        $maxH = $renditions[0]['height'] ?? 1080;

        $xml .= '    <AdaptationSet id="2" contentType="video"'
            . ' mimeType="video/mp4" codecs="' . $baseCodec . '"'
            . ' segmentAlignment="true" startWithSAP="1"'
            . ' maxWidth="' . $maxW . '" maxHeight="' . $maxH . '" maxFrameRate="25">' . "\n";

        if ($lcevcEnabled) {
            $xml .= '      <SupplementalProperty schemeIdUri="' . self::LCEVC_URN_SUPPLEMENTAL . '"'
                . ' value="lcevc_enabled=1;state=' . $lcevcState . '" />' . "\n";
            if (!empty($channelDna['lcevc_player_required'])) {
                $xml .= '      <EssentialProperty schemeIdUri="' . self::LCEVC_URN_ESSENTIAL . '"'
                    . ' value="lcevc_required=1" />' . "\n";
            }
        }

        $xml .= '      <SegmentTemplate timescale="90000"'
            . ' initialization="' . $baseUrl . '/init.mp4"'
            . ' media="' . $baseUrl . '/seg_$Number$.m4s"'
            . ' startNumber="0" duration="' . ($segDuration * 90000) . '" />' . "\n";

        foreach ($renditions as $rendition) {
            $xml .= '      <Representation id="' . $rendition['label'] . '"'
                . ' bandwidth="' . ($rendition['bitrate'] * 1000) . '"'
                . ' width="' . $rendition['width'] . '"'
                . ' height="' . $rendition['height'] . '"'
                . ' frameRate="25" />' . "\n";
        }
        $xml .= '    </AdaptationSet>' . "\n";

        // LCEVC Enhancement AdaptationSet (separate_track mode)
        if ($lcevcEnabled && ($channelDna['lcevc_mode'] ?? '') === 'separate_track') {
            $lcevcCodec = $this->resolveDashCodecString($channelDna, true);
            $xml .= '    <!-- LCEVC Enhancement Track (MPEG-5 Part 2 ISO/IEC 23094-2) -->' . "\n";
            $xml .= '    <AdaptationSet id="3" contentType="video" codecs="' . $lcevcCodec . '"'
                . ' mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">' . "\n";
            $xml .= '      <EssentialProperty schemeIdUri="' . self::LCEVC_URN_ESSENTIAL . '"'
                . ' value="lcevc_enhancement_track=1;state=' . $lcevcState . '" />' . "\n";
            $xml .= '      <SupplementalProperty schemeIdUri="' . self::LCEVC_URN_SUPPLEMENTAL . '"'
                . ' value="base_codec=' . ($channelDna['lcevc_base_codec'] ?? 'h264')
                . ';transport=' . ($channelDna['lcevc_transport'] ?? 'embedded') . '" />' . "\n";
            $xml .= '      <SegmentTemplate timescale="90000"'
                . ' initialization="' . $baseUrl . '/lcevc_init.mp4"'
                . ' media="' . $baseUrl . '/lcevc_seg_$Number$.m4s"'
                . ' startNumber="0" duration="' . ($segDuration * 90000) . '" />' . "\n";
            $xml .= '      <Representation id="lcevc_enhancement" bandwidth="200000" />' . "\n";
            $xml .= '    </AdaptationSet>' . "\n";
        }

        $xml .= '  </Period>' . "\n";
        $xml .= '</MPD>' . "\n";

        return $xml;
    }

    /**
     * Resolves VIDEO-RANGE attribute for STREAM-INF based on probe evidence in channel DNA.
     * Per ARTIFACT_HDR10_METADATA_TRIFECTA.md — the canonical HLS attribute for HDR signaling.
     *
     * Returns 'PQ' (HDR10/HDR10+), 'HLG', or null (SDR / no evidence).
     * NEVER returns a value without probe evidence — doctrine "Reglas Honestas".
     *
     * Sources checked in $dna (in priority order):
     *   - 'video_range'         (explicit override: 'PQ' | 'HLG' | 'SDR' | null)
     *   - 'hdr_type'            ('hdr10' | 'hdr10plus' | 'hlg' | 'dolby_vision' | 'sdr')
     *   - 'probe.transfer_characteristics'  (CICP enum: 16=PQ, 18=HLG)
     */
    private function resolveVideoRange(array $dna): ?string
    {
        // 1. Explicit override (set by orchestrator after probe)
        if (isset($dna['video_range'])) {
            $vr = strtoupper((string)$dna['video_range']);
            if ($vr === 'PQ' || $vr === 'HLG') {
                return $vr;
            }
            return null; // 'SDR', empty, or unrecognized → omit
        }

        // 2. HDR type derived from probe
        if (isset($dna['hdr_type'])) {
            $ht = strtolower((string)$dna['hdr_type']);
            if ($ht === 'hdr10' || $ht === 'hdr10plus' || $ht === 'dolby_vision') {
                return 'PQ';
            }
            if ($ht === 'hlg') {
                return 'HLG';
            }
        }

        // 3. CICP transfer_characteristics enum from probe
        $tc = $dna['probe']['transfer_characteristics'] ?? null;
        if ($tc === 16) {
            return 'PQ';
        }
        if ($tc === 18) {
            return 'HLG';
        }

        // No evidence — omit (SDR default per Reglas Honestas)
        return null;
    }

    private function resolveHlsCodecString(array $rendition, array $dna, bool $lcevcEnabled): string
    {
        $codec = $dna['codec_priority'][0] ?? 'h264';

        // Tier mapping per ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md
        // Reads optional probe fields: $rendition['bit_depth'], $rendition['fps'], $rendition['height'],
        // $dna['hdr_type']. When fields absent → falls through to default tier (legacy safe behavior).
        if (in_array($codec, ['hevc', 'h265'], true)) {
            $tierString = $this->resolveHevcTierString($rendition, $dna);
            if ($tierString !== null) {
                return $tierString . ',mp4a.40.2';
            }
            // Fallback: default Tier 9 (Main 8-bit 1080p@30) — safe for unknown content
            return self::LCEVC_CODEC_HEVC . ',mp4a.40.2';
        }

        $videoCodec = match($codec) {
            'av1'   => 'av01.0.08M.08',
            default => self::LCEVC_CODEC_H264,  // avc1.640028 — Tier 11 fallback universal
        };
        return $videoCodec . ',mp4a.40.2';
    }

    /**
     * Maps probe data to the appropriate HEVC tier (T1-T10) of the 11-tier cascade.
     * Per ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md.
     *
     * Returns null when probe data insufficient → caller uses default Tier 9 fallback.
     * NEVER returns a 10-bit/HDR tier without explicit probe evidence (Reglas Honestas).
     *
     * Tier selection rules:
     *   - Main 10 (HDR · Tiers 1-6): requires bit_depth >= 10 AND hdr_type ∈ {hdr10,hdr10plus,hlg,dolby_vision}
     *   - Main 8-bit SDR (Tiers 7-10): requires bit_depth signaling, no HDR
     *   - Resolution + fps determine the specific tier within the Main10 or Main groups
     */
    private function resolveHevcTierString(array $rendition, array $dna): ?string
    {
        // Read probe fields (optional in current contract — graceful absence handling)
        $bitDepth = isset($rendition['bit_depth']) ? (int)$rendition['bit_depth'] : null;
        $fps      = isset($rendition['fps']) ? (float)$rendition['fps'] : null;
        $height   = isset($rendition['height']) ? (int)$rendition['height'] : null;
        $hdrType  = isset($dna['hdr_type']) ? strtolower((string)$dna['hdr_type']) : null;

        // Insufficient probe data → caller falls back to default tier
        if ($height === null) {
            return null;
        }

        $isHdr = ($hdrType !== null && in_array($hdrType, ['hdr10', 'hdr10plus', 'hlg', 'dolby_vision'], true));
        $is10Bit = ($bitDepth !== null && $bitDepth >= 10);

        // 10-bit HDR tiers (T1-T6) — require both 10-bit AND HDR evidence
        if ($is10Bit && $isHdr) {
            // 4K (≥2160)
            if ($height >= 2160) {
                if ($fps !== null && $fps >= 100) {
                    return 'hvc1.2.4.L156.B0';  // T3: 4K@120 Main10 HDR (L5.2)
                }
                if ($fps !== null && $fps >= 50) {
                    return 'hvc1.2.4.L153.B0';  // T1: 4K@60 Main10 HDR (L5.1) — CORONA
                }
                return 'hvc1.2.4.L150.B0';      // T2: 4K@30 Main10 HDR (L5.0)
            }
            // 1080p (1080–2159)
            if ($height >= 1080) {
                if ($fps !== null && $fps >= 50) {
                    return 'hvc1.2.4.L123.B0';  // T4: 1080p@60 Main10 HDR (L4.1)
                }
                return 'hvc1.2.4.L120.B0';      // T5: 1080p@30 Main10 HDR (L4.0)
            }
            // 720p or lower → T6 último escalón 10-bit
            return 'hvc1.2.4.L93.B0';           // T6: 720p Main10 HDR (L3.1)
        }

        // 8-bit SDR tiers (T7-T10) — require bit_depth signal (or assume 8-bit if explicit)
        if ($bitDepth !== null) {
            // 4K SDR
            if ($height >= 2160) {
                if ($fps !== null && $fps >= 50) {
                    return 'hvc1.1.6.L153.B0';  // T7: 4K@60 Main 8-bit SDR
                }
                return 'hvc1.1.6.L150.B0';      // T8: 4K@30 Main 8-bit SDR
            }
            // 1080p SDR
            if ($height >= 1080) {
                return 'hvc1.1.6.L120.B0';      // T9: 1080p Main 8-bit SDR
            }
            // 720p or lower → T10 último HEVC
            return 'hvc1.1.6.L93.B0';           // T10: 720p Main 8-bit SDR
        }

        // bit_depth ausente → caller usa default safe (T9 = LCEVC_CODEC_HEVC)
        return null;
    }

    private function resolveDashCodecString(array $dna, bool $lcevcTrack): string
    {
        $codec = $dna['codec_priority'][0] ?? 'h264';
        $baseCodec = match($codec) {
            'hevc', 'h265' => self::LCEVC_CODEC_HEVC,
            default        => self::LCEVC_CODEC_H264,
        };
        return $lcevcTrack ? ($baseCodec . ';lvc1.1') : $baseCodec;
    }

    private function buildResult(string $status, string $message, array $data = []): array
    {
        return [
            'status'           => $status,
            'message'          => $message,
            'generator_version'=> self::GENERATOR_VERSION,
            'hls_path'         => $data['hls_path']  ?? null,
            'dash_path'        => $data['dash_path'] ?? null,
            'data'             => $data,
        ];
    }
}
