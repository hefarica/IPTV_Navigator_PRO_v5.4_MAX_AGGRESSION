<?php
declare(strict_types=1);

/**
 * APE ENGINE — cmaf_worker.php
 *
 * Worker de segmentación DASH/fMP4 CMAF que conserva una sola representación
 * de vídeo y audio mediante stream copy. La duración solicitada se expresa en
 * segundos (2, 4 o 6) con -seg_duration; con copy los cortes sólo pueden
 * ocurrir en keyframes naturales, por lo que la duración exacta no está
 * garantizada y no se declara "ZERO-FREEZE" como propiedad técnica.
 *
 * La construcción del comando es pura y está disponible para pruebas cuando
 * CMAF_WORKER_LIBRARY_ONLY está definido. El CLI conserva el flujo existente:
 * stdin TS -> FFmpeg -> DASH/HLS fMP4 -> HydraEvader/reconexión.
 */

/**
 * Normaliza y valida la configuración sin crear directorios, procesos ni logs.
 *
 * @return array<string, int|string>
 */
function cmafWorkerNormalizeConfig(array $config): array
{
    $ffmpegBin = trim((string)($config['ffmpeg_bin'] ?? '/usr/bin/ffmpeg'));
    if ($ffmpegBin === '') {
        throw new InvalidArgumentException('ffmpeg_bin no puede estar vacío');
    }

    $manifestPath = trim((string)($config['manifest_path'] ?? ''));
    if ($manifestPath === '') {
        throw new InvalidArgumentException('manifest_path es obligatorio');
    }

    // El tag es un contrato de entrada, no una orden para recodificar o fingir
    // otro codec. FFmpeg debe rechazar un tag incompatible con el bitstream.
    $codecTag = strtolower(trim((string)($config['codec_tag'] ?? '')));
    if (!in_array($codecTag, ['hvc1', 'avc1'], true)) {
        throw new InvalidArgumentException(
            'codec_tag debe ser exactamente hvc1 (HEVC) o avc1 (AVC); no se infieren ni falsean perfiles'
        );
    }

    $segDur = (int)($config['seg_dur'] ?? 6);
    if (!in_array($segDur, [2, 4, 6], true)) {
        throw new InvalidArgumentException('seg_dur debe ser 2, 4 o 6 segundos');
    }

    $windowSize = (int)($config['window_size'] ?? 10);
    $extraWindowSize = (int)($config['extra_window_size'] ?? 20);
    if ($windowSize < 0 || $extraWindowSize < 0) {
        throw new InvalidArgumentException('window_size y extra_window_size no pueden ser negativos');
    }

    $inputFormat = strtolower(trim((string)($config['input_format'] ?? 'mpegts')));
    if ($inputFormat === '' || !preg_match('/^[a-z0-9_.,-]+$/', $inputFormat)) {
        throw new InvalidArgumentException('input_format no es válido');
    }

    $probeSize = max(32_768, (int)($config['probesize'] ?? 10_000_000));
    $analyzeDuration = max(1_000_000, (int)($config['analyzeduration'] ?? 10_000_000));

    return [
        'ffmpeg_bin'      => $ffmpegBin,
        'manifest_path'   => $manifestPath,
        'codec_tag'       => $codecTag,
        'seg_dur'         => $segDur,
        'window_size'     => $windowSize,
        'extra_window_size' => $extraWindowSize,
        'input_format'    => $inputFormat,
        'probesize'       => $probeSize,
        'analyzeduration' => $analyzeDuration,
    ];
}

/**
 * Construye argv para el remux CMAF. No tiene side effects y no invoca shell.
 * La prueba puede inspeccionar este array y usar cmafWorkerShellCommand() para
 * ejecutar el mismo comando real con un archivo local alimentado por stdin.
 *
 * @return list<string>
 */
function cmafWorkerCommandArgs(array $config): array
{
    $cfg = cmafWorkerNormalizeConfig($config);

    return [
        (string)$cfg['ffmpeg_bin'],
        '-hide_banner',
        '-loglevel', 'warning',
        '-probesize', (string)$cfg['probesize'],
        '-analyzeduration', (string)$cfg['analyzeduration'],
        '-fflags', '+genpts+discardcorrupt',
        '-err_detect', 'ignore_err',
        '-avoid_negative_ts', 'make_zero',
        '-max_delay', '0',
        '-f', (string)$cfg['input_format'],
        '-i', 'pipe:0',
        // Una sola representación de vídeo fuente y, si existe, la primera
        // pista de audio. Nunca se crean escalas ABR ni encoders secundarios.
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
        '-c:a', 'copy',
        // Sólo cambia el sample-entry si el codec real es compatible; un hint
        // incorrecto hace fallar el muxer, no activa una recodificación.
        '-tag:v', (string)$cfg['codec_tag'],
        '-f', 'dash',
        '-seg_duration', (string)$cfg['seg_dur'],
        '-use_timeline', '1',
        '-use_template', '1',
        '-window_size', (string)$cfg['window_size'],
        '-extra_window_size', (string)$cfg['extra_window_size'],
        '-single_file', '0',
        '-dash_segment_type', 'mp4',
        '-init_seg_name', 'init-$RepresentationID$.m4s',
        '-media_seg_name', 'chunk-$RepresentationID$-$Number%06d$.m4s',
        // HLS regular basado en fMP4; no se activa ningún modo de baja latencia.
        '-hls_playlist', '1',
        '-hls_master_name', 'master.m3u8',
        // FFmpeg instalado acepta format_options para el muxer MP4 interno.
        '-format_options', 'movflags=+cmaf',
        (string)$cfg['manifest_path'],
    ];
}

/**
 * Devuelve el mismo comando como string seguro para proc_open().
 */
function cmafWorkerShellCommand(array $config): string
{
    return implode(' ', array_map(
        static fn(string $arg): string => escapeshellarg($arg),
        cmafWorkerCommandArgs($config)
    ));
}

// ─── TELEMETRÍA ──────────────────────────────────────────────────────────────
function guardianLog(array $data): void
{
    global $listId, $streamId;
    $data['_ts']      = microtime(true);
    $data['_iso']     = gmdate('Y-m-d\TH:i:s\Z');
    $data['resolver'] = 'cmaf_worker.php';
    $data['list_id']  = $listId ?? 'unknown';
    $data['channel']  = $streamId ?? 'unknown';
    $data['source']   = 'cmaf_worker';
    $line = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    @file_put_contents('/dev/shm/ape_guardian/events.jsonl', $line, FILE_APPEND | LOCK_EX);
}

// ─── HYDRA STREAM EVADER ─────────────────────────────────────────────────────
class HydraEvader
{
    private string $primaryUrl;
    private array $pool;
    private string $manifestPath;
    private int $maxRetries = 8;

    private array $userAgents = [
        'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
        'VLC/3.0.20 LibVLC/3.0.20',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'ExoPlayerLib/2.19.1 (Linux; Android 12; sdk_gphone64_x86_64) ExoPlayerLib/2.19.1',
        'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ];

    public function __construct(string $primaryUrl, array $pool, string $manifestPath)
    {
        $this->primaryUrl   = $primaryUrl;
        $this->pool         = $pool;
        $this->manifestPath = $manifestPath;
    }

    /** Construye la URL conservando path/query para un host alternativo. */
    private function buildUrlForHost(string $host, string $originalUrl): string
    {
        $parsed = parse_url($originalUrl);
        if (!$parsed) return $originalUrl;
        $scheme = $parsed['scheme'] ?? 'http';
        $path   = $parsed['path']   ?? '/';
        $query  = isset($parsed['query']) ? '?' . $parsed['query'] : '';
        return "{$scheme}://{$host}{$path}{$query}";
    }

    /** Descarga el TS al stdin de FFmpeg y conserva la reconexión existente. */
    public function fetchStream($ffmpegStdin): bool
    {
        $currentUrl = $this->primaryUrl;
        $attempt    = 0;

        while ($attempt < $this->maxRetries) {
            $ua = $this->userAgents[$attempt % count($this->userAgents)];

            $ch = curl_init($currentUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => false,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 5,
                CURLOPT_TIMEOUT        => 0,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_USERAGENT      => $ua,
                CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
                CURLOPT_HTTPHEADER     => [
                    'Accept: */*',
                    'Connection: keep-alive',
                    'Cache-Control: no-cache',
                ],
                CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use ($ffmpegStdin) {
                    if (!is_resource($ffmpegStdin)) return -1;
                    $written = @fwrite($ffmpegStdin, $chunk);
                    if ($written === false) return -1;
                    return strlen($chunk);
                },
            ]);

            // No se registran URLs/hosts de origen ni valores de autenticación.
            guardianLog([
                'event'   => 'hydra_fetch_start',
                'attempt' => $attempt + 1,
                'origin'  => 'configured',
            ]);

            curl_exec($ch);
            $httpCode  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_errno($ch);
            $speed     = round(curl_getinfo($ch, CURLINFO_SPEED_DOWNLOAD) / 1024, 1);
            curl_close($ch);

            guardianLog([
                'event'        => 'hydra_fetch_end',
                'attempt'      => $attempt + 1,
                'http_code'    => $httpCode,
                'curl_error'   => $curlError,
                'speed_kbps'   => $speed,
            ]);

            if (file_exists($this->manifestPath) &&
                (time() - filemtime($this->manifestPath)) > 300) {
                guardianLog(['event' => 'suicide_switch_triggered', 'reason' => 'manifest_stale_300s']);
                return false;
            }

            if ($httpCode >= 200 && $httpCode < 300 && $curlError === 0) {
                return true;
            }

            if ($curlError === CURLE_WRITE_ERROR) {
                guardianLog(['event' => 'ffmpeg_pipe_broken']);
                return false;
            }

            $nextHost = $this->pool[$attempt % count($this->pool)] ?? null;
            if ($nextHost) {
                $currentUrl = $this->buildUrlForHost($nextHost, $this->primaryUrl);
                guardianLog([
                    'event'    => 'hydra_host_rotation',
                    'attempt'  => $attempt + 1,
                    'pool_slot' => $attempt % count($this->pool),
                ]);
            }

            $attempt++;
            if ($attempt < $this->maxRetries) {
                usleep((int)(pow(2, min($attempt, 5)) * 100_000));
            }
        }

        guardianLog(['event' => 'hydra_max_retries_exhausted', 'attempts' => $attempt]);
        return false;
    }
}

/**
 * Punto de entrada CLI. Separado para que incluir este archivo como biblioteca
 * no cree directorios, PID, procesos, redes ni ejecute el bucle principal.
 */
function cmafWorkerMain(array $argv): int
{
    $argc = count($argv);
    if ($argc < 4) {
        fwrite(STDERR, "Usage: php cmaf_worker.php <originUrl> <cmafDir> <codecTag: hvc1|avc1> [listId]\n");
        return 1;
    }

    $originUrl    = (string)$argv[1];
    $cmafDir      = rtrim((string)$argv[2], '/');
    $codecTag     = (string)$argv[3];
    $listId       = (string)($argv[4] ?? 'unknown');
    $streamId     = basename($cmafDir);
    $manifestPath = $cmafDir . '/manifest.mpd';
    $pidFile      = $cmafDir . '/worker.pid';

    // guardianLog conserva su API histórica, pero el contexto sólo existe al
    // ejecutar el CLI; el modo library-only nunca pasa por este bloque.
    $GLOBALS['listId'] = $listId;
    $GLOBALS['streamId'] = $streamId;

    if (!is_dir($cmafDir)) {
        if (!@mkdir($cmafDir, 0777, true)) {
            fwrite(STDERR, "[APE-WORKER] ERROR: No se pudo crear {$cmafDir}\n");
            return 1;
        }
    }
    foreach (['/dev/shm/ape_guardian', '/dev/shm/ape_metrics/' . $streamId] as $directory) {
        if (!is_dir($directory)) @mkdir($directory, 0777, true);
    }
    file_put_contents($pidFile, (string)getmypid());

    $dnaPath = '/dev/shm/ape_metrics/' . $streamId . '/target_dna.json';
    $dna = [];
    if (file_exists($dnaPath)) {
        $raw = @file_get_contents($dnaPath);
        if ($raw !== false) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) $dna = $decoded;
        }
    }

    guardianLog([
        'event'      => 'worker_start',
        'origin'     => 'configured',
        'codec_tag'  => $codecTag,
        'dna_loaded' => !empty($dna),
    ]);

    $ffmpegBin = trim((string)shell_exec('which ffmpeg 2>/dev/null')) ?: '/usr/bin/ffmpeg';
    try {
        $workerConfig = cmafWorkerNormalizeConfig([
            'ffmpeg_bin'        => $ffmpegBin,
            'manifest_path'     => $manifestPath,
            'codec_tag'         => $codecTag,
            'seg_dur'           => $dna['seg_dur'] ?? 6,
            'window_size'       => $dna['window_size'] ?? 10,
            'extra_window_size' => $dna['extra_window_size'] ?? 20,
            'input_format'      => 'mpegts',
        ]);
    } catch (Throwable $error) {
        guardianLog(['event' => 'worker_config_invalid', 'error' => $error->getMessage()]);
        fwrite(STDERR, "[APE-WORKER] ERROR: {$error->getMessage()}\n");
        return 1;
    }

    $cmd = cmafWorkerShellCommand($workerConfig);
    guardianLog([
        'event'             => 'ffmpeg_cmd_built',
        'seg_dur_s'         => $workerConfig['seg_dur'],
        'window_size'       => $workerConfig['window_size'],
        'extra_window'      => $workerConfig['extra_window_size'],
        'video_mode'        => 'copy_single_representation',
        'audio_mode'        => 'copy_if_present',
        'dash_segment_type' => 'mp4',
        'cmaf'              => true,
        'hls_mode'          => 'regular_fmp4_not_low_latency',
    ]);

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['file', '/dev/null', 'w'],
        2 => ['file', $cmafDir . '/ffmpeg.log', 'a'],
    ];

    $ffmpegProcess = proc_open($cmd, $descriptorSpec, $pipes);
    if (!is_resource($ffmpegProcess)) {
        guardianLog(['event' => 'ffmpeg_open_failed']);
        fwrite(STDERR, "[APE-WORKER] ERROR: No se pudo abrir FFmpeg.\n");
        return 1;
    }
    $ffmpegStdin = $pipes[0];

    $originPool = [];
    if (!empty($dna['origin_pool']) && is_array($dna['origin_pool'])) {
        $originPool = $dna['origin_pool'];
    }
    $primaryHost = parse_url($originUrl, PHP_URL_HOST);
    if (is_string($primaryHost) && $primaryHost !== '') {
        $primaryHost .= ':' . (parse_url($originUrl, PHP_URL_PORT) ?? 80);
        if (!in_array($primaryHost, $originPool, true)) $originPool[] = $primaryHost;
    }

    $evader = new HydraEvader($originUrl, $originPool, $manifestPath);
    guardianLog(['event' => 'worker_loop_start', 'pool_size' => count($originPool)]);

    $loopCount = 0;
    while (true) {
        $loopCount++;
        if ($loopCount > 1 && file_exists($manifestPath) &&
            (time() - filemtime($manifestPath)) > 300) {
            guardianLog(['event' => 'suicide_switch_main_loop', 'loops' => $loopCount]);
            break;
        }

        $alive = $evader->fetchStream($ffmpegStdin);
        if (!$alive) {
            guardianLog(['event' => 'worker_fatal_exit', 'loops' => $loopCount]);
            break;
        }

        guardianLog(['event' => 'worker_reconnecting', 'loop' => $loopCount]);
        usleep(500_000);
    }

    guardianLog(['event' => 'worker_cleanup_start']);
    if (is_resource($ffmpegStdin)) @fclose($ffmpegStdin);
    if (is_resource($ffmpegProcess)) {
        @proc_terminate($ffmpegProcess, 9);
        @proc_close($ffmpegProcess);
    }
    if (file_exists($pidFile)) @unlink($pidFile);

    $files = glob($cmafDir . '/*') ?: [];
    foreach ($files as $file) {
        if (is_file($file)) @unlink($file);
    }
    @rmdir($cmafDir);
    guardianLog(['event' => 'worker_exit_clean']);
    return 0;
}

if (!defined('CMAF_WORKER_LIBRARY_ONLY')) {
    exit(cmafWorkerMain($argv));
}
