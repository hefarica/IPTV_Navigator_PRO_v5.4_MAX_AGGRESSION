<?php
declare(strict_types=1);

/**
 * Validación del contrato CMAF copy-only.
 *
 * Por defecto no necesita una fixture privada: valida el constructor, sus
 * opciones y los recuentos mínimos. Con --fixture <archivo> ejecuta FFmpeg
 * real alimentando ese archivo por stdin, remuxa 2/4/6 s, inspecciona la
 * salida DASH/HLS fMP4, decodifica a null, compara hashes de frames y ejecuta
 * un filtro scale+unsharp únicamente en una ruta offline post-decode.
 */

define('CMAF_WORKER_LIBRARY_ONLY', true);
require_once __DIR__ . '/../../IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_worker.php';

define('CMAF_COUNCIL_LOG', getenv('APE_CMAF_TEST_LOG') ?: sys_get_temp_dir() . '/ape-cmaf-test-' . getmypid() . '.log');
define('CMAF_VALIDATION_JSON', getenv('APE_CMAF_TEST_JSON') ?: sys_get_temp_dir() . '/ape-cmaf-test-' . getmypid() . '.json');

function cmafTestLog(string $event, array $data = []): void
{
    $record = [
        'ts' => gmdate('c'),
        'event' => $event,
    ] + $data;
    file_put_contents(
        CMAF_COUNCIL_LOG,
        json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

/** @param list<string> $args */
function cmafTestShellCommand(array $args): string
{
    return implode(' ', array_map(
        static fn(string $arg): string => escapeshellarg($arg),
        $args
    ));
}

/**
 * Ejecuta un proceso con stderr temporal. Si $stdinPath existe, su contenido
 * se copia literalmente al stdin del proceso; no se crea ni se modifica video.
 *
 * @param list<string> $args
 * @return array{rc:int,stdout:string,stderr:string}
 */
function cmafTestRun(array $args, ?string $stdinPath = null): array
{
    $stderrPath = tempnam(sys_get_temp_dir(), 'cmaf-stderr-');
    if ($stderrPath === false) {
        throw new RuntimeException('No se pudo crear stderr temporal');
    }

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['file', $stderrPath, 'a'],
    ];
    $process = proc_open(cmafTestShellCommand($args), $descriptorSpec, $pipes);
    if (!is_resource($process)) {
        @unlink($stderrPath);
        throw new RuntimeException('No se pudo abrir el proceso de prueba');
    }

    if ($stdinPath !== null) {
        $input = fopen($stdinPath, 'rb');
        if ($input === false) {
            @fclose($pipes[0]);
            @fclose($pipes[1]);
            @proc_terminate($process);
            @proc_close($process);
            @unlink($stderrPath);
            throw new RuntimeException('No se pudo abrir la fixture local');
        }
        // Un hint incompatible puede hacer que FFmpeg cierre stdin antes de
        // consumir toda la fixture; el fallo se valida por return code y no
        // debe contaminar el test con un warning de broken pipe.
        @stream_copy_to_stream($input, $pipes[0]);
        fclose($input);
    }
    fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $rc = proc_close($process);
    $stderr = (string)@file_get_contents($stderrPath);
    @unlink($stderrPath);

    return [
        'rc' => (int)$rc,
        'stdout' => (string)$stdout,
        'stderr' => $stderr,
    ];
}

/** @param list<string> $args */
function cmafTestRunOrFail(array $args, ?string $stdinPath = null): array
{
    $result = cmafTestRun($args, $stdinPath);
    if ($result['rc'] !== 0) {
        throw new RuntimeException(
            'Proceso multimedia falló rc=' . $result['rc'] . ': ' . trim($result['stderr'])
        );
    }
    return $result;
}

function cmafTestBinary(string $name, string $fallback): string
{
    $path = trim((string)shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
    return $path !== '' ? $path : $fallback;
}

/** @return array<string,mixed> */
function cmafTestProbe(string $ffprobe, string $path, ?string $inputFormat = null): array
{
    $args = [$ffprobe, '-hide_banner', '-v', 'error'];
    if ($inputFormat !== null) {
        $args[] = '-f';
        $args[] = $inputFormat;
    }
    $args = array_merge($args, [
        '-show_entries',
        'stream=index,codec_type,codec_name,codec_tag_string,profile,level,pix_fmt,width,height:format=format_name,duration',
        '-of', 'json',
        $path,
    ]);
    $result = cmafTestRunOrFail($args);
    $decoded = json_decode($result['stdout'], true);
    if (!is_array($decoded)) {
        throw new RuntimeException('ffprobe no devolvió JSON');
    }
    return $decoded;
}

/** @return array<string,mixed> */
function cmafTestFirstVideo(array $probe): array
{
    foreach (($probe['streams'] ?? []) as $stream) {
        if (($stream['codec_type'] ?? '') === 'video') {
            return $stream;
        }
    }
    throw new RuntimeException('La fixture no contiene vídeo');
}

function cmafTestInputFormat(array $probe, string $fixture): string
{
    $format = (string)($probe['format']['format_name'] ?? '');
    $primary = strtolower((string)explode(',', $format)[0]);
    if ($primary !== '') {
        return match ($primary) {
            'matroska', 'webm' => 'matroska',
            'mpegts' => 'mpegts',
            default => $primary,
        };
    }
    $extension = strtolower((string)pathinfo($fixture, PATHINFO_EXTENSION));
    return $extension === 'ts' ? 'mpegts' : 'matroska';
}

/**
 * Hash estable de los bytes de frames decodificados, sin incluir PTS ni
 * cabeceras framemd5; permite comprobar integridad de copy entre fuente y
 * manifest sin escribir una salida de vídeo intermedia.
 *
 * @return array{sha256:string,frames:int}
 */
function cmafTestFrameHash(string $ffmpeg, string $input, ?string $inputFormat = null): array
{
    $args = [$ffmpeg, '-hide_banner', '-loglevel', 'error'];
    if ($inputFormat !== null) {
        $args[] = '-f';
        $args[] = $inputFormat;
    }
    $args = array_merge($args, [
        '-i', $input,
        '-map', '0:v:0',
        '-f', 'framemd5',
        'pipe:1',
    ]);
    $result = cmafTestRunOrFail($args);
    $frameHashes = [];
    foreach (preg_split('/\R/', $result['stdout']) ?: [] as $line) {
        if (preg_match('/\s([0-9a-f]{32})\s*$/i', trim($line), $match)) {
            $frameHashes[] = strtolower($match[1]);
        }
    }
    if ($frameHashes === []) {
        throw new RuntimeException('framemd5 no produjo frames decodificados');
    }
    return [
        'sha256' => hash('sha256', implode("\n", $frameHashes)),
        'frames' => count($frameHashes),
    ];
}

/** @return list<float> */
function cmafTestSegmentDurations(string $manifestPath): array
{
    $manifest = file_get_contents($manifestPath);
    if ($manifest === false) {
        throw new RuntimeException('No se pudo leer manifest.mpd');
    }
    if (!preg_match('/<SegmentTemplate\b([^>]*)>(.*?)<\/SegmentTemplate>/s', $manifest, $template)) {
        return [];
    }
    $timescale = 1;
    if (preg_match('/\btimescale="([0-9]+)"/', $template[1], $match)) {
        $timescale = max(1, (int)$match[1]);
    }
    preg_match_all('/<S\b([^>]*)\/>/', $template[2], $segments);
    $durations = [];
    foreach ($segments[1] as $attributes) {
        if (!preg_match('/\bd="([0-9]+)"/', $attributes, $durationMatch)) {
            continue;
        }
        $duration = (int)$durationMatch[1] / $timescale;
        $repeat = 0;
        if (preg_match('/\br="(-?[0-9]+)"/', $attributes, $repeatMatch)) {
            $repeat = (int)$repeatMatch[1];
        }
        // Las salidas VOD de esta prueba son finitas; no se inventa una
        // expansión para r=-1, cuyo límite requeriría estado externo.
        $count = $repeat >= 0 ? $repeat + 1 : 1;
        for ($i = 0; $i < $count; $i++) {
            $durations[] = round($duration, 6);
        }
    }
    return $durations;
}

function cmafTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

/** @param list<string> $args */
function cmafTestCountPair(array $args, string $option, string $value): int
{
    $count = 0;
    for ($i = 0, $length = count($args) - 1; $i < $length; $i++) {
        if ($args[$i] === $option && $args[$i + 1] === $value) {
            $count++;
        }
    }
    return $count;
}

/** @return array<string,mixed> */
function cmafTestConstructorChecks(): array
{
    $default = cmafWorkerNormalizeConfig([
        'manifest_path' => '/tmp/cmaf-copy-test/manifest.mpd',
        'codec_tag' => 'hvc1',
    ]);
    cmafTestAssert($default['seg_dur'] === 6, 'default seg_dur debe ser 6');
    cmafTestAssert($default['input_format'] === 'mpegts', 'default input_format debe ser mpegts');
    cmafTestAssert($default['window_size'] === 10, 'default window_size debe ser 10');
    cmafTestAssert($default['extra_window_size'] === 20, 'default extra_window_size debe ser 20');

    $durationCommands = [];
    foreach ([2, 4, 6] as $duration) {
        $args = cmafWorkerCommandArgs([
            'manifest_path' => '/tmp/cmaf-copy-test/manifest-' . $duration . '.mpd',
            'codec_tag' => 'hvc1',
            'seg_dur' => $duration,
        ]);
        cmafTestAssert(cmafTestCountPair($args, '-seg_duration', (string)$duration) === 1, "seg_duration {$duration} no quedó exacto");
        $durationCommands[(string)$duration] = [
            'seg_duration' => $duration,
            'cmaf_command' => true,
        ];
    }

    $args = cmafWorkerCommandArgs($default);
    cmafTestAssert(cmafTestCountPair($args, '-c:v', 'copy') === 1, 'debe existir un único -c:v copy');
    cmafTestAssert(cmafTestCountPair($args, '-c:a', 'copy') === 1, 'debe existir un único -c:a copy');
    cmafTestAssert(cmafTestCountPair($args, '-map', '0:v:0') === 1, 'debe existir un único mapa de video fuente');
    cmafTestAssert(cmafTestCountPair($args, '-map', '0:a:0?') === 1, 'debe existir un único mapa de audio opcional');
    cmafTestAssert(cmafTestCountPair($args, '-tag:v', 'hvc1') === 1, 'HEVC debe usar tag hvc1');
    cmafTestAssert(cmafTestCountPair($args, '-f', 'dash') === 1, 'debe usar muxer dash');
    cmafTestAssert(cmafTestCountPair($args, '-dash_segment_type', 'mp4') === 1, 'debe usar segmentos mp4');
    cmafTestAssert(cmafTestCountPair($args, '-format_options', 'movflags=+cmaf') === 1, 'debe solicitar CMAF al muxer MP4');

    $forbidden = [
        '-filter_complex', '-vf', '-filter:v', '-b:v', '-maxrate', '-bufsize',
        '-g', '-keyint_min', '-sc_threshold', '-preset', '-bsf:v', '-bsf:a',
        '-min_seg_duration', '-hls_segment_type', '-streaming', '-lhls',
        'libx264', 'libx265', 'h264_mp4toannexb', 'aac_adtstoasc',
    ];
    foreach ($forbidden as $token) {
        cmafTestAssert(!in_array($token, $args, true), "opción prohibida presente: {$token}");
    }

    foreach (['avc1', 'hvc1'] as $tag) {
        $tagArgs = cmafWorkerCommandArgs([
            'manifest_path' => '/tmp/cmaf-copy-test/' . $tag . '.mpd',
            'codec_tag' => $tag,
        ]);
        cmafTestAssert(cmafTestCountPair($tagArgs, '-tag:v', $tag) === 1, "tag {$tag} no quedó explícito");
    }

    $invalidDurationRejected = false;
    try {
        cmafWorkerCommandArgs([
            'manifest_path' => '/tmp/cmaf-copy-test/invalid.mpd',
            'codec_tag' => 'hvc1',
            'seg_dur' => 3,
        ]);
    } catch (InvalidArgumentException) {
        $invalidDurationRejected = true;
    }
    cmafTestAssert($invalidDurationRejected, 'seg_dur=3 debe rechazarse');

    $invalidTagRejected = false;
    try {
        cmafWorkerCommandArgs([
            'manifest_path' => '/tmp/cmaf-copy-test/invalid-tag.mpd',
            'codec_tag' => 'hev1',
        ]);
    } catch (InvalidArgumentException) {
        $invalidTagRejected = true;
    }
    cmafTestAssert($invalidTagRejected, 'codec_tag heurístico debe rechazarse');

    return [
        'defaults' => [
            'seg_dur' => $default['seg_dur'],
            'window_size' => $default['window_size'],
            'extra_window_size' => $default['extra_window_size'],
            'input_format' => $default['input_format'],
        ],
        'duration_commands' => $durationCommands,
        'token_counts' => [
            'video_copy' => cmafTestCountPair($args, '-c:v', 'copy'),
            'audio_copy' => cmafTestCountPair($args, '-c:a', 'copy'),
            'video_map' => cmafTestCountPair($args, '-map', '0:v:0'),
            'audio_map' => cmafTestCountPair($args, '-map', '0:a:0?'),
        ],
        'forbidden_options_absent' => $forbidden,
        'wrong_duration_rejected' => true,
        'wrong_tag_rejected' => true,
        'video_filter_in_remux' => false,
    ];
}

/** @return array<string,mixed> */
function cmafTestMultimedia(string $fixture, ?string $requestedTag): array
{
    if (!is_file($fixture) || !is_readable($fixture)) {
        throw new RuntimeException('--fixture no existe o no es legible');
    }

    $ffmpeg = cmafTestBinary('ffmpeg', '/usr/bin/ffmpeg');
    $ffprobe = cmafTestBinary('ffprobe', '/usr/bin/ffprobe');
    $sourceProbe = cmafTestProbe($ffprobe, $fixture);
    $sourceVideo = cmafTestFirstVideo($sourceProbe);
    $inputFormat = cmafTestInputFormat($sourceProbe, $fixture);
    $codecName = strtolower((string)($sourceVideo['codec_name'] ?? ''));
    $derivedTag = match ($codecName) {
        'hevc' => 'hvc1',
        'h264' => 'avc1',
        default => throw new RuntimeException('fixture codec no soportado para sample-entry: ' . $codecName),
    };
    $codecTag = $requestedTag !== null ? strtolower($requestedTag) : $derivedTag;

    $root = sys_get_temp_dir() . '/cmaf-copy-test-' . getmypid() . '-' . bin2hex(random_bytes(4));
    if (!mkdir($root, 0700, true)) {
        throw new RuntimeException('No se pudo crear workspace temporal');
    }

    $results = [
        'fixture_label' => 'optional_local_fixture',
        'source_probe' => [
            'codec_name' => $codecName,
            'profile' => $sourceVideo['profile'] ?? null,
            'level' => $sourceVideo['level'] ?? null,
            'pix_fmt' => $sourceVideo['pix_fmt'] ?? null,
            'width' => $sourceVideo['width'] ?? null,
            'height' => $sourceVideo['height'] ?? null,
            'duration' => $sourceProbe['format']['duration'] ?? null,
        ],
        'input_format' => $inputFormat,
        'requested_codec_tag' => $codecTag,
        'remuxes' => [],
        'wrong_hint' => [],
        'limits' => [
            'source_is_local' => true,
            'video_mode' => 'single_representation_stream_copy',
            'audio_mode' => 'stream_copy_if_present',
            'no_video_recompression' => true,
            'segment_duration_exactness' => 'not_guaranteed; copy cuts only on natural keyframes',
            'video_filter_mode' => 'offline post-decode null sink only',
            'll_hls_claim' => false,
            'signal_type' => 'local fixture; not provider/player evidence',
        ],
    ];

    try {
        $sourceHash = cmafTestFrameHash($ffmpeg, $fixture, $inputFormat);
        $results['source_frame_hash'] = $sourceHash;

        foreach ([2, 4, 6] as $duration) {
            $dir = $root . '/d' . $duration;
            if (!mkdir($dir, 0700, true)) {
                throw new RuntimeException('No se pudo crear salida temporal');
            }
            $manifest = $dir . '/manifest.mpd';
            $config = [
                'ffmpeg_bin' => $ffmpeg,
                'manifest_path' => $manifest,
                'codec_tag' => $codecTag,
                'seg_dur' => $duration,
                'window_size' => 0,
                'extra_window_size' => 0,
                'input_format' => $inputFormat,
            ];
            $commandArgs = cmafWorkerCommandArgs($config);
            $remux = cmafTestRun($commandArgs, $fixture);
            if ($remux['rc'] !== 0) {
                throw new RuntimeException('remux copy ' . $duration . 's falló: ' . trim($remux['stderr']));
            }
            cmafTestAssert(is_file($manifest), 'no se creó manifest.mpd para ' . $duration . 's');
            $masterPlaylist = $dir . '/master.m3u8';
            $mediaPlaylist = $dir . '/media_0.m3u8';
            $initSegments = glob($dir . '/init-*.m4s') ?: [];
            $mediaSegments = glob($dir . '/chunk-*.m4s') ?: [];
            cmafTestAssert(is_file($masterPlaylist), 'no se creó master.m3u8 para ' . $duration . 's');
            cmafTestAssert(is_file($mediaPlaylist), 'no se creó media_0.m3u8 para ' . $duration . 's');
            cmafTestAssert(count($initSegments) === 1, 'se esperaba un init CMAF de video para ' . $duration . 's');
            cmafTestAssert(count($mediaSegments) > 0, 'se esperaban chunks CMAF para ' . $duration . 's');
            $masterText = (string)file_get_contents($masterPlaylist);
            cmafTestAssert(strpos($masterText, '#EXT-X-PREFETCH') === false, 'no se debe presentar LL-HLS por accidente');

            $outputProbe = cmafTestProbe($ffprobe, $manifest);
            $outputVideo = cmafTestFirstVideo($outputProbe);
            $decode = cmafTestRunOrFail([
                $ffmpeg, '-hide_banner', '-loglevel', 'error',
                '-i', $manifest,
                '-map', '0:v:0',
                '-f', 'null', '-',
            ]);
            $outputHash = cmafTestFrameHash($ffmpeg, $manifest);
            $segmentDurations = cmafTestSegmentDurations($manifest);

            cmafTestAssert(($outputVideo['codec_name'] ?? '') === $codecName, 'codec de salida cambió en ' . $duration . 's');
            cmafTestAssert(($outputVideo['codec_tag_string'] ?? '') === $codecTag, 'sample-entry incorrecto en ' . $duration . 's');
            cmafTestAssert(($outputVideo['pix_fmt'] ?? '') === ($sourceVideo['pix_fmt'] ?? ''), 'pix_fmt cambió en ' . $duration . 's');
            cmafTestAssert((string)($outputVideo['profile'] ?? '') === (string)($sourceVideo['profile'] ?? ''), 'profile cambió en ' . $duration . 's');
            cmafTestAssert((string)($outputVideo['level'] ?? '') === (string)($sourceVideo['level'] ?? ''), 'level cambió en ' . $duration . 's');
            cmafTestAssert($sourceHash['sha256'] === $outputHash['sha256'], 'hash de frames cambió en ' . $duration . 's');
            cmafTestAssert($sourceHash['frames'] === $outputHash['frames'], 'recuento de frames cambió en ' . $duration . 's');
            cmafTestAssert($segmentDurations !== [], 'no se hallaron duraciones DASH en ' . $duration . 's');

            $results['remuxes'][(string)$duration] = [
                'return_code' => $remux['rc'],
                'probe' => [
                    'codec_name' => $outputVideo['codec_name'] ?? null,
                    'codec_tag_string' => $outputVideo['codec_tag_string'] ?? null,
                    'profile' => $outputVideo['profile'] ?? null,
                    'level' => $outputVideo['level'] ?? null,
                    'pix_fmt' => $outputVideo['pix_fmt'] ?? null,
                    'duration' => $outputProbe['format']['duration'] ?? null,
                ],
                'decode_to_null' => [
                    'return_code' => $decode['rc'],
                    'passed' => true,
                ],
                'frame_hash_output' => $outputHash,
                'segment_durations_seconds' => $segmentDurations,
                'target_duration_seconds' => $duration,
                'exact_target_claimed' => false,
                'cmaf' => true,
                'hls' => 'regular_fmp4_playlist',
                'artifacts' => [
                    'master_m3u8' => true,
                    'media_0_m3u8' => true,
                    'init_segments' => count($initSegments),
                    'media_segments' => count($mediaSegments),
                    'll_hls_prefetch' => false,
                ],
            ];
            cmafTestLog('remux_pass', [
                'duration' => $duration,
                'codec_name' => $outputVideo['codec_name'] ?? null,
                'codec_tag_string' => $outputVideo['codec_tag_string'] ?? null,
                'profile' => $outputVideo['profile'] ?? null,
                'level' => $outputVideo['level'] ?? null,
                'pix_fmt' => $outputVideo['pix_fmt'] ?? null,
                'frame_hash_sha256' => $outputHash['sha256'],
                'frames' => $outputHash['frames'],
                'segment_durations_seconds' => $segmentDurations,
                'decode_to_null' => true,
                'cmaf_artifacts' => count($mediaSegments),
            ]);
        }

        $wrongTag = $codecTag === 'hvc1' ? 'avc1' : 'hvc1';
        $wrongManifest = $root . '/wrong-hint/manifest.mpd';
        @mkdir(dirname($wrongManifest), 0700, true);
        $wrongResult = cmafTestRun(cmafWorkerCommandArgs([
            'ffmpeg_bin' => $ffmpeg,
            'manifest_path' => $wrongManifest,
            'codec_tag' => $wrongTag,
            'seg_dur' => 2,
            'window_size' => 0,
            'extra_window_size' => 0,
            'input_format' => $inputFormat,
        ]), $fixture);
        cmafTestAssert($wrongResult['rc'] !== 0, 'hint codec incorrecto no provocó fallo del muxer');
        $results['wrong_hint'] = [
            'requested_tag' => $wrongTag,
            'return_code' => $wrongResult['rc'],
            'failed_as_required' => true,
            'recompression_attempted' => false,
        ];
        cmafTestLog('wrong_hint_rejected', [
            'requested_tag' => $wrongTag,
            'return_code' => $wrongResult['rc'],
            'recompression_attempted' => false,
        ]);

        $filter = "scale=w='max(iw,3840)':h='max(ih,2160)':force_original_aspect_ratio=increase:flags=lanczos,unsharp=5:5:1.0:5:5:0.0,showinfo";
        $filterResult = cmafTestRunOrFail([
            $ffmpeg, '-hide_banner', '-loglevel', 'info',
            '-f', $inputFormat,
            '-i', $fixture,
            '-map', '0:v:0',
            '-vf', $filter,
            '-frames:v', '3',
            '-an',
            '-f', 'null', '-',
        ]);
        cmafTestAssert(preg_match('/showinfo.*\bs:(\d+)x(\d+)/', $filterResult['stderr'], $geometry) === 1,
            'el filtro no acreditó geometría de frames decodificados');
        cmafTestAssert((int)$geometry[1] >= max(3840, (int)$sourceVideo['width'])
            && (int)$geometry[2] >= max(2160, (int)$sourceVideo['height']), 'el filtro no cumple floor UHD o redujo fuente superior');
        $results['video_filter_postdecode'] = [
            'filter' => $filter,
            'return_code' => $filterResult['rc'],
            'observed_width' => (int)$geometry[1],
            'observed_height' => (int)$geometry[2],
            'sample_frames' => 3,
            'sink' => 'null',
            'encoded_output' => false,
            'remux_command_contains_filter' => false,
        ];
        cmafTestLog('video_filter_postdecode_pass', [
            'filter' => $filter,
            'sink' => 'null',
            'encoded_output' => false,
        ]);
        cmafTestLog('limits', $results['limits']);
    } finally {
        cmafTestRemoveTree($root);
    }

    return $results;
}

function cmafTestRemoveTree(string $path): void
{
    if (!is_dir($path)) return;
    $entries = scandir($path) ?: [];
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $child = $path . '/' . $entry;
        if (is_dir($child)) cmafTestRemoveTree($child);
        else @unlink($child);
    }
    @rmdir($path);
}

$fixture = null;
$requestedTag = null;
for ($i = 1, $argc = count($argv); $i < $argc; $i++) {
    if ($argv[$i] === '--fixture') {
        $fixture = $argv[++$i] ?? null;
    } elseif ($argv[$i] === '--codec-tag') {
        $requestedTag = $argv[++$i] ?? null;
    } else {
        fwrite(STDERR, "Uso: php test_cmaf_copy.php [--fixture archivo] [--codec-tag hvc1|avc1]\n");
        exit(2);
    }
}

file_put_contents(CMAF_COUNCIL_LOG, '');
cmafTestLog('test_start', [
    'fixture_mode' => $fixture !== null,
    'scope' => 'constructor_and_optional_local_multimedia',
]);

$report = [
    'test' => 'test_cmaf_copy.php',
    'passed' => false,
    'constructor' => null,
    'multimedia' => null,
    'limits' => [
        'copy_preserves_encoded_video; no filter/encoder/bitrate/GOP is used by remux',
        'seg_duration is a target; natural keyframes mean exact 2/4/6 seconds are not guaranteed',
        'HEVC Main 10 / AVC sample-entry is accepted only as explicit hvc1 / avc1 hint',
        'wrong codec hint must fail; this test does not recode or relabel incompatible video',
        'videoFilter scale+unsharp is post-decode offline to null and is not part of the remux worker',
        'DASH/HLS fMP4 output is not evidence of LL-HLS',
        'optional media evidence is local fixture evidence, not provider/player evidence',
    ],
];
$exitCode = 0;
try {
    $report['constructor'] = cmafTestConstructorChecks();
    cmafTestLog('constructor_pass', [
        'video_copy' => $report['constructor']['token_counts']['video_copy'],
        'audio_copy' => $report['constructor']['token_counts']['audio_copy'],
        'duration_variants' => [2, 4, 6],
    ]);

    if ($fixture !== null) {
        $report['multimedia'] = cmafTestMultimedia($fixture, $requestedTag);
        cmafTestLog('multimedia_pass', [
            'durations' => [2, 4, 6],
            'fixture_label' => 'optional_local_fixture',
            'video_filter' => 'scale+unsharp_to_null',
        ]);
    } else {
        $report['multimedia'] = [
            'skipped' => true,
            'reason' => 'no --fixture supplied; constructor-only default is intentional',
        ];
        cmafTestLog('multimedia_skipped', ['reason' => 'no_fixture']);
    }
    $report['passed'] = true;
    cmafTestLog('test_pass', ['passed' => true]);
} catch (Throwable $error) {
    $report['error'] = $error->getMessage();
    cmafTestLog('test_fail', ['passed' => false, 'error' => $error->getMessage()]);
    $exitCode = 1;
}

file_put_contents(
    CMAF_VALIDATION_JSON,
    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL
);
echo json_encode([
    'passed' => $report['passed'],
    'constructor' => $report['constructor'] !== null,
    'multimedia' => $fixture !== null,
    'report' => CMAF_VALIDATION_JSON,
    'log' => CMAF_COUNCIL_LOG,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($exitCode);
