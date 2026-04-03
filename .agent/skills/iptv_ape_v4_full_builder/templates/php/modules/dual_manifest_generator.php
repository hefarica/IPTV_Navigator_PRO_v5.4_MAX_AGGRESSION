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
    const LCEVC_CODEC_HEVC       = 'hvc1.1.6.L120.90';

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

        foreach ($renditions as $rendition) {
            $codec      = $this->resolveHlsCodecString($rendition, $channelDna, $lcevcEnabled);
            $bandwidth  = ($rendition['bitrate'] + 128) * 1000;
            $avgBw      = (int)($bandwidth * 0.85);
            $resolution = $rendition['width'] . 'x' . $rendition['height'];

            $lines[] = '#EXT-X-STREAM-INF:'
                . 'BANDWIDTH=' . $bandwidth . ','
                . 'AVERAGE-BANDWIDTH=' . $avgBw . ','
                . 'CODECS="' . $codec . '",'
                . 'RESOLUTION=' . $resolution . ','
                . 'FRAME-RATE=25.000,'
                . 'AUDIO="audio",'
                . 'CLOSED-CAPTIONS=NONE';
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

    private function resolveHlsCodecString(array $rendition, array $dna, bool $lcevcEnabled): string
    {
        $codec = $dna['codec_priority'][0] ?? 'h264';
        $videoCodec = match($codec) {
            'hevc', 'h265' => 'hvc1.1.6.L120.90',
            'av1'          => 'av01.0.08M.08',
            default        => 'avc1.640028',
        };
        return $videoCodec . ',mp4a.40.2';
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
