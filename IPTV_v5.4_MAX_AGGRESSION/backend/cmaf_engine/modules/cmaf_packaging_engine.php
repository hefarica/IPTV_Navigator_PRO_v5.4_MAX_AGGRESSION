<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IPTV Navigator PRO — CMAF Architecture Layer                              ║
 * ║  Module: CMAF Packaging Engine (CPE) v2.0.0                                ║
 * ║                                                                            ║
 * ║  REAL EXECUTION: FFmpeg is invoked for actual CMAF packaging.              ║
 * ║  LCEVC SUPPORT: Separate track mode via lcevc_h264/lcevc_hevc encoder.     ║
 * ║  FFPROBE VALIDATION: Post-packaging validation of output segments.         ║
 * ║                                                                            ║
 * ║  CODEC STRATEGY (HEVC-First per APE doctrine):                             ║
 * ║  - HEVC (H.265): preferred for 4K/UHD                                      ║
 * ║  - H.264 (AVC): baseline compatibility                                     ║
 * ║  - AV1: future support                                                     ║
 * ║  - LCEVC: enhancement layer on top of H.264 or HEVC base                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

class CmafPackagingEngine
{
    const ENGINE_VERSION = '2.0.0';

    // ─── Packaging Profiles ───────────────────────────────────────────────────
    const PROFILE_VOD         = 'vod';
    const PROFILE_LIVE        = 'live';
    const PROFILE_LOW_LATENCY = 'low_latency';

    // ─── Segment Durations (seconds) ─────────────────────────────────────────
    const SEG_DURATION = [
        self::PROFILE_VOD         => 4,
        self::PROFILE_LIVE        => 2,
        self::PROFILE_LOW_LATENCY => 1,
    ];

    // ─── Default ABR Ladder ───────────────────────────────────────────────────
    const DEFAULT_ABR_LADDER = [
        ['label' => 'video_1080', 'width' => 1920, 'height' => 1080, 'bitrate' => 5000, 'profile' => 'high',  'level' => '4.2'],
        ['label' => 'video_720',  'width' => 1280, 'height' => 720,  'bitrate' => 2800, 'profile' => 'high',  'level' => '4.1'],
        ['label' => 'video_540',  'width' => 960,  'height' => 540,  'bitrate' => 1400, 'profile' => 'main',  'level' => '3.1'],
        ['label' => 'video_360',  'width' => 640,  'height' => 360,  'bitrate' => 700,  'profile' => 'main',  'level' => '3.0'],
    ];

    // ─── Default Audio Profile ────────────────────────────────────────────────
    const DEFAULT_AUDIO_PROFILE = [
        ['label' => 'audio_spa', 'lang' => 'spa', 'bitrate' => 128, 'channels' => 2],
    ];

    // ─── Paths ────────────────────────────────────────────────────────────────
    const STREAMS_BASE_PATH = '/var/www/html/streams';
    const FFMPEG_BIN        = '/usr/bin/ffmpeg';
    const FFPROBE_BIN       = '/usr/bin/ffprobe';

    // ─── Execution Timeout (seconds) ─────────────────────────────────────────
    const EXEC_TIMEOUT_LIVE = 30;  // Live: 30s to produce first segments
    const EXEC_TIMEOUT_VOD  = 300; // VOD: 5 minutes

    // ─── LCEVC Encoder Names (V-Nova FFmpeg plugin) ───────────────────────────
    const LCEVC_ENCODER_H264 = 'lcevc_h264';
    const LCEVC_ENCODER_HEVC = 'lcevc_hevc';

    // ─── Internal State ───────────────────────────────────────────────────────
    private string $channelId;
    private string $sourceUrl;
    private string $profile;
    private array  $abrLadder;
    private array  $audioProfiles;
    private string $outputPath;
    private string $codec        = 'h264';
    private bool   $lcevcEnabled = false;
    private string $lcevcMode    = 'separate_track'; // 'separate_track' | 'sei_metadata'
    private string $lcevcBase    = 'h264';
    private array  $packagingLog = [];

    // ─── HDR State (per ARTIFACT_HDR10_METADATA_TRIFECTA.md + Chain of Manifestation eslabón 5) ──
    // Populated from channelDna in package(). Empty/null when SDR (no FFmpeg HDR flags emitted).
    // Per "Reglas Honestas" (CLAUDE.md): NEVER emit HDR flags without probe evidence.
    private ?string $hdrType     = null;  // 'hdr10' | 'hdr10plus' | 'hlg' | 'dolby_vision' | null
    private bool    $is10Bit     = false; // true → ffmpeg -pix_fmt yuv420p10le
    private ?int    $maxCll      = null;  // Content Light Level Info — max
    private ?int    $maxFall     = null;  // Content Light Level Info — max frame-average
    private ?string $masterDisplay = null; // x265-params master-display string

    /**
     * Main entry point. Packages a stream into CMAF segments.
     *
     * @param string $sourceUrl   URL of the source stream.
     * @param string $channelId   Unique channel identifier.
     * @param string $profile     Packaging profile (vod, live, low_latency).
     * @param array  $channelDna  Channel DNA from channels_map.json.
     * @return array              Packaging result with status and output paths.
     */
    public static function package(
        string $sourceUrl,
        string $channelId,
        string $profile = self::PROFILE_LIVE,
        array  $channelDna = []
    ): array {
        $engine = new self();
        $engine->channelId    = $channelId;
        $engine->sourceUrl    = $sourceUrl;
        $engine->profile      = $profile;
        $engine->outputPath   = self::STREAMS_BASE_PATH . '/' . $channelId . '/cmaf';

        // Inherit ABR ladder and audio from channel DNA
        $engine->abrLadder     = $channelDna['abr_ladder']     ?? self::DEFAULT_ABR_LADDER;
        $engine->audioProfiles = $channelDna['audio_profiles'] ?? self::DEFAULT_AUDIO_PROFILE;

        // Codec: HEVC-First per APE doctrine
        $codecPriority   = $channelDna['codec_priority'] ?? ['h264'];
        $engine->codec   = $codecPriority[0] ?? 'h264';

        // LCEVC configuration from channel DNA
        $engine->lcevcEnabled = !empty($channelDna['lcevc_enabled']);
        $engine->lcevcMode    = $channelDna['lcevc_mode']       ?? 'separate_track';
        $engine->lcevcBase    = $channelDna['lcevc_base_codec'] ?? $engine->codec;

        // HDR detection from channel DNA (probe evidence required per "Reglas Honestas")
        // SDR is default — HDR flags only emitted when DNA carries explicit HDR signals.
        $hdrType = $channelDna['hdr_type'] ?? null;
        if ($hdrType !== null) {
            $hdrType = strtolower((string)$hdrType);
            if (in_array($hdrType, ['hdr10', 'hdr10plus', 'hlg', 'dolby_vision'], true)) {
                $engine->hdrType = $hdrType;
                $engine->is10Bit = ($channelDna['bit_depth'] ?? 10) >= 10;
                $engine->maxCll  = isset($channelDna['max_cll'])  ? (int)$channelDna['max_cll']  : null;
                $engine->maxFall = isset($channelDna['max_fall']) ? (int)$channelDna['max_fall'] : null;
                // master-display: optional x265 string from probe (BT.2020 primaries + display luminance)
                // Format per x265: G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(50000000,1)
                $engine->masterDisplay = $channelDna['master_display'] ?? null;
            }
        }

        return $engine->runPackagingPipeline();
    }

    /**
     * Orchestrates the full CMAF packaging pipeline with real FFmpeg execution.
     */
    private function runPackagingPipeline(): array
    {
        // ── Step 1: Validate FFmpeg availability ──────────────────────────────
        if (!$this->validateFfmpeg()) {
            return $this->buildResult('error', 'FFmpeg not found at ' . self::FFMPEG_BIN);
        }

        // ── Step 2: Create output directory structure ─────────────────────────
        if (!$this->createOutputStructure()) {
            return $this->buildResult('error', 'Failed to create output directory structure.');
        }

        // ── Step 3: Build FFmpeg command ──────────────────────────────────────
        $ffmpegCmd = $this->buildFfmpegCommand();

        $this->packagingLog[] = [
            'action'       => 'FFMPEG_COMMAND_BUILT',
            'command'      => $ffmpegCmd,
            'profile'      => $this->profile,
            'codec'        => $this->codec,
            'lcevc_enabled'=> $this->lcevcEnabled,
            'lcevc_mode'   => $this->lcevcMode,
        ];

        // ── Step 4: Execute FFmpeg (REAL EXECUTION) ───────────────────────────
        $timeout    = ($this->profile === self::PROFILE_VOD) ? self::EXEC_TIMEOUT_VOD : self::EXEC_TIMEOUT_LIVE;
        $execResult = $this->executeCommand($ffmpegCmd, $timeout);

        $this->packagingLog[] = [
            'action'      => 'FFMPEG_EXECUTED',
            'return_code' => $execResult['return_code'],
            'output_lines'=> count($execResult['output']),
        ];

        if ($execResult['return_code'] !== 0) {
            // FFmpeg failed — log stderr and return error
            $stderr = implode("\n", array_slice($execResult['output'], -20));
            $this->packagingLog[] = [
                'action' => 'FFMPEG_STDERR',
                'stderr' => $stderr,
            ];
            return $this->buildResult('error', 'FFmpeg execution failed (code ' . $execResult['return_code'] . ')', [
                'ffmpeg_command' => $ffmpegCmd,
                'stderr_tail'    => $stderr,
                'packaging_log'  => $this->packagingLog,
            ]);
        }

        // ── Step 5: Post-packaging validation with ffprobe ────────────────────
        $validationResult = $this->validateOutputWithFfprobe();
        $this->packagingLog[] = [
            'action'     => 'FFPROBE_VALIDATION',
            'result'     => $validationResult,
        ];

        // ── Step 6: Generate segment metadata ────────────────────────────────
        $segmentMetadata = $this->generateSegmentMetadata();

        return $this->buildResult('success', 'CMAF packaging completed successfully.', [
            'ffmpeg_command'    => $ffmpegCmd,
            'output_path'       => $this->outputPath,
            'segment_metadata'  => $segmentMetadata,
            'validation'        => $validationResult,
            'packaging_log'     => $this->packagingLog,
            'lcevc_packaged'    => $this->lcevcEnabled,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FFMPEG COMMAND BUILDER
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildFfmpegCommand(): string
    {
        $segDuration = self::SEG_DURATION[$this->profile];
        $cmd = [self::FFMPEG_BIN, '-y']; // -y: overwrite output files without asking

        // ── Input options ─────────────────────────────────────────────────────
        if ($this->profile !== self::PROFILE_VOD) {
            $cmd[] = '-re'; // Read at native frame rate for live
        }
        $cmd[] = '-i ' . escapeshellarg($this->sourceUrl);

        // ── Stream mapping ────────────────────────────────────────────────────
        foreach ($this->abrLadder as $rendition) {
            $cmd[] = '-map 0:v:0';
        }
        foreach ($this->audioProfiles as $audio) {
            $cmd[] = '-map 0:a:0';
        }

        // ── Video encoding per rendition ──────────────────────────────────────
        $videoIndex = 0;
        foreach ($this->abrLadder as $rendition) {
            if ($this->lcevcEnabled) {
                // LCEVC encoding: base encoder + enhancement layer
                $lcevcEncoder = ($this->lcevcBase === 'hevc') ? self::LCEVC_ENCODER_HEVC : self::LCEVC_ENCODER_H264;
                $baseEncoder  = ($this->lcevcBase === 'hevc') ? 'libx265' : 'libx264';
                $cmd[] = "-c:v:$videoIndex $lcevcEncoder";
                $cmd[] = "-base_encoder $baseEncoder";
                if ($this->lcevcMode === 'separate_track') {
                    $cmd[] = '-separate_track 1';
                }
                // LCEVC enhancement parameters
                $cmd[] = '-eil_params "rc=cbr:br=' . $rendition['bitrate'] . 'k"';
                $cmd[] = '-base_params "preset=medium:tune=zerolatency"';
            } else {
                // Standard encoding
                $codecLib = $this->getCodecLibrary();
                $cmd[] = "-c:v:$videoIndex $codecLib";
            }

            $cmd[] = "-b:v:$videoIndex {$rendition['bitrate']}k";
            $cmd[] = "-s:v:$videoIndex {$rendition['width']}x{$rendition['height']}";

            // Closed GOP for ABR alignment (dynamic fps detection)
            $fps     = 25; // Default; ffprobe can detect real fps
            $gopSize = 2 * $fps;
            $cmd[] = "-g:v:$videoIndex $gopSize";
            $cmd[] = "-keyint_min:v:$videoIndex $gopSize";
            $cmd[] = "-sc_threshold:v:$videoIndex 0";

            if (in_array($this->codec, ['h264', 'avc']) && !$this->lcevcEnabled) {
                $cmd[] = "-profile:v:$videoIndex {$rendition['profile']}";
                $cmd[] = "-level:v:$videoIndex {$rendition['level']}";
            }

            // ─── HDR pass-through flags (per Chain of Manifestation eslabón 5) ───
            // Aditivo · solo se emiten cuando $this->hdrType !== null (probe evidence)
            // Per ARTIFACT_HDR10_METADATA_TRIFECTA.md: BT.2020 + PQ/HLG + Matrix=9
            if ($this->hdrType !== null) {
                $hdrFlags = $this->buildHdrFfmpegFlags($videoIndex);
                foreach ($hdrFlags as $flag) {
                    $cmd[] = $flag;
                }
            }

            $videoIndex++;
        }

        // ── Audio encoding ────────────────────────────────────────────────────
        $audioIndex = 0;
        foreach ($this->audioProfiles as $audio) {
            $cmd[] = "-c:a:$audioIndex aac";
            $cmd[] = "-b:a:$audioIndex {$audio['bitrate']}k";
            $cmd[] = "-ac:a:$audioIndex {$audio['channels']}";
            if (!empty($audio['lang'])) {
                $cmd[] = "-metadata:s:a:$audioIndex language={$audio['lang']}";
            }
            $audioIndex++;
        }

        // ── Output format: DASH with CMAF fMP4 segments ───────────────────────
        $cmd[] = '-f dash';
        $cmd[] = "-seg_duration $segDuration";
        $cmd[] = '-use_template 1';
        $cmd[] = '-use_timeline 0';
        $cmd[] = "-init_seg_name 'init.mp4'";
        $cmd[] = "-media_seg_name 'seg_\$Number\$.m4s'";

        // ── Live streaming options ────────────────────────────────────────────
        if ($this->profile !== self::PROFILE_VOD) {
            $cmd[] = '-window_size 10';
            $cmd[] = '-extra_window_size 5';
            $cmd[] = '-remove_at_exit 0';
        }

        // ── Low-latency options ───────────────────────────────────────────────
        if ($this->profile === self::PROFILE_LOW_LATENCY) {
            $cmd[] = '-frag_duration 500000'; // 0.5s chunks
            $cmd[] = '-ldash 1';
        }

        // ── Dual manifest: generate HLS alongside DASH ────────────────────────
        $cmd[] = '-hls_playlist 1';
        $cmd[] = "-hls_master_name 'master.m3u8'";

        // ── Adaptation sets ───────────────────────────────────────────────────
        $videoCount = count($this->abrLadder);
        $audioCount = count($this->audioProfiles);
        $adaptSets  = 'id=0,streams=v';
        if ($audioCount > 0) {
            $adaptSets .= ' id=1,streams=a';
        }
        // LCEVC enhancement track as separate adaptation set
        if ($this->lcevcEnabled && $this->lcevcMode === 'separate_track') {
            $adaptSets .= ' id=2,streams=v'; // enhancement track
        }
        $cmd[] = "-adaptation_sets \"$adaptSets\"";

        // ── Output MPD path ───────────────────────────────────────────────────
        $mpdPath = $this->outputPath . '/stream.mpd';
        $cmd[] = escapeshellarg($mpdPath);

        return implode(' ', $cmd);
    }

    private function getCodecLibrary(): string
    {
        return match($this->codec) {
            'hevc', 'h265' => 'libx265',
            'av1'          => 'libaom-av1',
            default        => 'libx264',
        };
    }

    /**
     * Builds FFmpeg flags for HDR pass-through encoding.
     * Per ARTIFACT_HDR10_METADATA_TRIFECTA.md + Chain of Manifestation eslabón 5.
     *
     * Emits CICP values (ITU-T H.273): primaries=9 (BT.2020), trc=16 (PQ) or 18 (HLG), matrix=9 (BT.2020 NC).
     * For HEVC (libx265), adds -x265-params with hdr-opt/colorprim/transfer/colormatrix/master-display/max-cll.
     * For H.264 (libx264), only color metadata (less HDR support but signaling preserved).
     *
     * @param int $videoIndex Per-rendition video stream index for -flag:v:N suffix
     * @return array          Array of FFmpeg arg strings to append
     */
    private function buildHdrFfmpegFlags(int $videoIndex): array
    {
        $flags = [];

        // Color primaries: BT.2020 (CICP 9) for all HDR types
        $colorPrim = 'bt2020';
        // Transfer characteristics: PQ (CICP 16) for HDR10/HDR10+/DV, HLG (CICP 18) for HLG
        $colorTrc  = ($this->hdrType === 'hlg') ? 'arib-std-b67' : 'smpte2084';
        // Matrix coefficients: BT.2020 non-constant luminance (CICP 9)
        $colorSpace = 'bt2020nc';

        $flags[] = "-color_primaries:v:$videoIndex $colorPrim";
        $flags[] = "-color_trc:v:$videoIndex $colorTrc";
        $flags[] = "-colorspace:v:$videoIndex $colorSpace";
        $flags[] = "-color_range:v:$videoIndex tv"; // limited range (broadcast)

        // 10-bit pixel format for HDR (required for Main10 / HDR10)
        if ($this->is10Bit) {
            $flags[] = "-pix_fmt:v:$videoIndex yuv420p10le";
        }

        // HEVC-specific: x265 HDR params + mastering display + max-cll
        // (libx264 does not natively support HDR signaling beyond color flags)
        if (in_array($this->codec, ['hevc', 'h265'], true)) {
            $x265Params = [
                'hdr-opt=1',          // enable HDR optimization
                'repeat-headers=1',   // emit VPS/SPS/PPS in every IDR (needed for HDR signaling)
                'colorprim=bt2020',
                "transfer={$colorTrc}",
                "colormatrix={$colorSpace}",
            ];

            if ($this->masterDisplay !== null) {
                // Format example: "G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(50000000,1)"
                $x265Params[] = 'master-display=' . $this->masterDisplay;
            }

            if ($this->maxCll !== null && $this->maxFall !== null) {
                $x265Params[] = "max-cll={$this->maxCll},{$this->maxFall}";
            }

            $flags[] = "-x265-params:v:$videoIndex \"" . implode(':', $x265Params) . "\"";
        }

        return $flags;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REAL COMMAND EXECUTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Executes a shell command with timeout and captures stdout+stderr.
     * Uses proc_open for proper stream handling.
     */
    private function executeCommand(string $cmd, int $timeout): array
    {
        $descriptors = [
            0 => ['pipe', 'r'],  // stdin
            1 => ['pipe', 'w'],  // stdout
            2 => ['pipe', 'w'],  // stderr
        ];

        $process = proc_open($cmd, $descriptors, $pipes);

        if (!is_resource($process)) {
            return ['return_code' => -1, 'output' => ['proc_open failed']];
        }

        // Close stdin immediately
        fclose($pipes[0]);

        // Set non-blocking reads
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $output    = [];
        $startTime = time();

        while (true) {
            $elapsed = time() - $startTime;
            if ($elapsed >= $timeout) {
                proc_terminate($process, 9);
                $output[] = "TIMEOUT after {$timeout}s";
                break;
            }

            $status = proc_get_status($process);
            if (!$status['running']) {
                break;
            }

            // Read available output
            $line = fgets($pipes[1]);
            if ($line !== false) $output[] = rtrim($line);
            $line = fgets($pipes[2]);
            if ($line !== false) $output[] = rtrim($line);

            usleep(100000); // 100ms polling
        }

        // Drain remaining output
        while (($line = fgets($pipes[1])) !== false) $output[] = rtrim($line);
        while (($line = fgets($pipes[2])) !== false) $output[] = rtrim($line);

        fclose($pipes[1]);
        fclose($pipes[2]);

        $returnCode = proc_close($process);

        return [
            'return_code' => $returnCode,
            'output'      => $output,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FFPROBE VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Validates the packaged output using ffprobe.
     * Checks for:
     *   - init.mp4 existence and valid codec
     *   - At least one .m4s segment
     *   - LCEVC enhancement track presence (if lcevc_enabled)
     */
    private function validateOutputWithFfprobe(): array
    {
        $initPath = $this->outputPath . '/init.mp4';
        $result   = [
            'init_exists'    => false,
            'segments_found' => 0,
            'codec_detected' => null,
            'lcevc_track'    => false,
            'valid'          => false,
        ];

        if (!file_exists(self::FFPROBE_BIN)) {
            $result['error'] = 'ffprobe not found at ' . self::FFPROBE_BIN;
            return $result;
        }

        // Check init.mp4
        if (!file_exists($initPath)) {
            $result['error'] = 'init.mp4 not found after packaging';
            return $result;
        }
        $result['init_exists'] = true;

        // Count .m4s segments
        $segments = glob($this->outputPath . '/seg_*.m4s') ?: [];
        $result['segments_found'] = count($segments);

        // Probe init.mp4 for codec info
        $probeCmd = self::FFPROBE_BIN
            . ' -v quiet -print_format json -show_streams '
            . escapeshellarg($initPath)
            . ' 2>/dev/null';

        $probeOutput = shell_exec($probeCmd);
        if ($probeOutput) {
            $probeData = json_decode($probeOutput, true);
            $streams   = $probeData['streams'] ?? [];

            foreach ($streams as $stream) {
                if ($stream['codec_type'] === 'video') {
                    $result['codec_detected'] = $stream['codec_name'] ?? null;
                }
                // Detect LCEVC enhancement track
                if (
                    isset($stream['codec_name']) &&
                    str_contains(strtolower($stream['codec_name']), 'lcevc')
                ) {
                    $result['lcevc_track'] = true;
                }
            }
        }

        // Validate LCEVC track presence if expected
        if ($this->lcevcEnabled && $this->lcevcMode === 'separate_track') {
            if (!$result['lcevc_track']) {
                $result['lcevc_warning'] = 'LCEVC separate track not found in output. '
                    . 'Ensure lcevc_h264/lcevc_hevc FFmpeg encoder is installed.';
            }
        }

        $result['valid'] = $result['init_exists'] && $result['segments_found'] > 0;
        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OUTPUT STRUCTURE CREATION
    // ═══════════════════════════════════════════════════════════════════════════

    private function createOutputStructure(): bool
    {
        $dirs = [$this->outputPath];

        foreach ($this->abrLadder as $rendition) {
            $dirs[] = $this->outputPath . '/' . $rendition['label'];
        }
        foreach ($this->audioProfiles as $audio) {
            $dirs[] = $this->outputPath . '/' . $audio['label'];
        }

        foreach ($dirs as $dir) {
            if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
                $this->packagingLog[] = ['action' => 'DIR_CREATE_FAILED', 'path' => $dir];
                return false;
            }
        }

        $this->packagingLog[] = [
            'action' => 'OUTPUT_STRUCTURE_CREATED',
            'base'   => $this->outputPath,
            'dirs'   => $dirs,
        ];

        return true;
    }

    private function validateFfmpeg(): bool
    {
        return file_exists(self::FFMPEG_BIN) && is_executable(self::FFMPEG_BIN);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEGMENT METADATA GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    private function generateSegmentMetadata(): array
    {
        $segDuration = self::SEG_DURATION[$this->profile];
        $renditions  = [];

        foreach ($this->abrLadder as $rendition) {
            $renditions[] = [
                'label'       => $rendition['label'],
                'width'       => $rendition['width'],
                'height'      => $rendition['height'],
                'bitrate'     => $rendition['bitrate'],
                'codec'       => $this->lcevcEnabled ? ($this->lcevcBase . '+lcevc') : $this->codec,
                'init_seg'    => $this->outputPath . '/init.mp4',
                'seg_pattern' => $this->outputPath . '/seg_$Number$.m4s',
                'seg_duration'=> $segDuration,
            ];
        }

        $audioTracks = [];
        foreach ($this->audioProfiles as $audio) {
            $audioTracks[] = [
                'label'    => $audio['label'],
                'lang'     => $audio['lang'],
                'bitrate'  => $audio['bitrate'],
                'channels' => $audio['channels'],
                'codec'    => 'aac',
            ];
        }

        return [
            'channel_id'     => $this->channelId,
            'profile'        => $this->profile,
            'codec'          => $this->codec,
            'lcevc_enabled'  => $this->lcevcEnabled,
            'lcevc_mode'     => $this->lcevcMode,
            'seg_duration'   => $segDuration,
            'output_path'    => $this->outputPath,
            'renditions'     => $renditions,
            'audio_tracks'   => $audioTracks,
            'mpd_path'       => $this->outputPath . '/stream.mpd',
            'hls_master_path'=> $this->outputPath . '/master.m3u8',
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESULT BUILDER
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildResult(string $status, string $message, array $data = []): array
    {
        return [
            'status'         => $status,
            'message'        => $message,
            'engine_version' => self::ENGINE_VERSION,
            'data'           => $data,
        ];
    }
}
