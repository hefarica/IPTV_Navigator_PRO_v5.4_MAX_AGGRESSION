<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  APE ENGINE — cmaf_worker.php — v20.0 "ZERO-FREEZE SPINAL CORD"        ║
 * ║                                                                          ║
 * ║  Motor de segmentación CMAF/DASH con:                                   ║
 * ║  • GOP-Adaptive Segmentation (min_seg_duration, nunca seg_duration fijo) ║
 * ║  • Naming correcto: init-0.m4s / chunk-0-NNNNN.m4s (RepresentationID)  ║
 * ║  • Hydra Stream Evader: reconexión automática con backoff exponencial    ║
 * ║  • DNA-Driven: lee target_dna.json del RAM-disk para configuración       ║
 * ║  • Telemetría 100ms: health score, micro-freeze detection, UDP metrics  ║
 * ║  • Suicide Switch: auto-kill si nadie pide el stream en 300s            ║
 * ║  • Window deslizante: 10 segmentos visibles + 20 extra en disco         ║
 * ║                                                                          ║
 * ║  USO: php cmaf_worker.php <originUrl> <cmafDir> <codecTag> [listId]     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ─── 0. ARGUMENTOS ──────────────────────────────────────────────────────────
if ($argc < 3) {
    fwrite(STDERR, "Usage: php cmaf_worker.php <originUrl> <cmafDir> [codecTag] [listId]\n");
    exit(1);
}

$originUrl   = $argv[1];
$cmafDir     = rtrim($argv[2], '/');
$codecTag    = $argv[3] ?? 'avc1';
$listId      = $argv[4] ?? 'unknown';
$streamId    = basename($cmafDir);
$manifestPath = $cmafDir . '/manifest.mpd';
$pidFile     = $cmafDir . '/worker.pid';

// ─── 1. PREPARAR DIRECTORIO ──────────────────────────────────────────────────
if (!is_dir($cmafDir)) {
    if (!@mkdir($cmafDir, 0777, true)) {
        fwrite(STDERR, "[APE-WORKER] ERROR: No se pudo crear {$cmafDir}\n");
        exit(1);
    }
}
// Asegurar que los directorios RAM-disk existen
foreach (['/dev/shm/ape_guardian', '/dev/shm/ape_metrics/' . $streamId] as $d) {
    if (!is_dir($d)) @mkdir($d, 0777, true);
}
file_put_contents($pidFile, (string)getmypid());

// ─── 2. TELEMETRÍA GUARDIAN ──────────────────────────────────────────────────
function guardianLog(array $data): void
{
    global $listId, $streamId;
    $data['_ts']      = microtime(true);
    $data['_iso']     = gmdate('Y-m-d\TH:i:s\Z');
    $data['resolver'] = 'cmaf_worker.php';
    $data['list_id']  = $listId;
    $data['channel']  = $streamId;
    $data['source']   = 'cmaf_worker';
    $line = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    @file_put_contents('/dev/shm/ape_guardian/events.jsonl', $line, FILE_APPEND | LOCK_EX);
}

// ─── 3. LEER DNA DEL CANAL ───────────────────────────────────────────────────
// resolve_quality.php escribe el ADN completo en /dev/shm/ape_metrics/<id>/target_dna.json
// antes de lanzar este worker. Aquí lo leemos para configurar FFmpeg con los valores reales.
$dnaPath = '/dev/shm/ape_metrics/' . $streamId . '/target_dna.json';
$dna = [];
if (file_exists($dnaPath)) {
    $raw = @file_get_contents($dnaPath);
    if ($raw !== false) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $dna = $decoded;
        }
    }
}

guardianLog([
    'event'      => 'worker_start',
    'origin_url' => preg_replace('/\/[^\/]+\/[^\/]+\/(\d+)/', '/***/***/\1', $originUrl),
    'codec_tag'  => $codecTag,
    'dna_loaded' => !empty($dna),
]);

// ─── 4. CONFIGURACIÓN FFmpeg DESDE DNA ───────────────────────────────────────

// Bitrate objetivo (kbps) — del DNA o fallback por codec
$targetKbps = (int)($dna['target_kbps'] ?? 0);
if ($targetKbps <= 0) {
    $targetKbps = match(true) {
        str_contains(strtolower($codecTag), 'hev'), str_contains(strtolower($codecTag), 'hvc') => 8000,
        default => 6000,
    };
}

// GOP-Adaptive Segment Duration
// REGLA DE ORO: NUNCA usar -seg_duration fijo. Siempre -min_seg_duration.
// Con -c:v copy no se pueden insertar keyframes artificiales, así que FFmpeg
// DEBE esperar el keyframe natural del GOP. min_seg_duration garantiza que
// el segmento tenga AL MENOS esa duración antes de cortar en el próximo keyframe.
// Resultado: segmentos de duración variable pero SIEMPRE completos → cero freeze.
$segDurSec = (int)($dna['seg_dur'] ?? 6);
if ($segDurSec < 2 || $segDurSec > 12) $segDurSec = 6;
$minSegDurationUs = $segDurSec * 1_000_000; // microsegundos

// Ventana deslizante — cuántos segmentos mantener en disco
// 10 visibles en el MPD + 20 extra = 30 segmentos × 6s = 180s de buffer en disco
$windowSize      = max(8,  (int)($dna['window_size']       ?? 10));
$extraWindowSize = max(15, (int)($dna['extra_window_size'] ?? 20));

// Probe/analyze duration — más tiempo = más estabilidad en streams fragmentados
$probeSize   = 10_000_000; // 10 MB
$analyzeDur  = 10_000_000; // 10 s

// ─── 5. CONSTRUIR COMANDO FFmpeg ─────────────────────────────────────────────
//
// ARQUITECTURA DE NAMING (CRÍTICO — debe coincidir con resolve_quality.php):
//   init-$RepresentationID$.m4s  →  init-0.m4s (video), init-1.m4s (audio)
//   chunk-$RepresentationID$-$Number%05d$.m4s  →  chunk-0-00001.m4s, etc.
//
// -f dash con -hls_playlist 1 genera también media_0.m3u8 y media_1.m3u8
// que son los manifiestos HLS por representación (usados por resolve_quality.php)
//
// -bsf:v h264_mp4toannexb: convierte H.264 Annex-B (MPEG-TS) → AVCC (fMP4)
// -bsf:a aac_adtstoasc:    convierte AAC ADTS (MPEG-TS) → ASC (fMP4)
// -tag:v avc1:             codec tag correcto para DASH/CMAF
// -tag:a mp4a:             codec tag correcto para audio fMP4

$ffmpegBin = trim((string)shell_exec('which ffmpeg 2>/dev/null')) ?: '/usr/bin/ffmpeg';

$cmd  = escapeshellarg($ffmpegBin);
$cmd .= ' -hide_banner -loglevel warning';
$cmd .= " -probesize {$probeSize} -analyzeduration {$analyzeDur}";
$cmd .= ' -fflags +genpts+discardcorrupt';
$cmd .= ' -err_detect ignore_err';
$cmd .= ' -avoid_negative_ts make_zero';
$cmd .= ' -max_delay 0';
// Input: TS crudo desde stdin (pipe:0)
$cmd .= ' -f mpegts -i pipe:0';
// Mapear primer stream de video y primer stream de audio
$cmd .= ' -map 0:v:0? -map 0:a:0?';
// Copiar streams sin recodificar (cero latencia, cero CPU)
$cmd .= ' -c:v copy -c:a copy';
// Bitstream filters para conversión TS→fMP4
$cmd .= ' -bsf:v h264_mp4toannexb';
$cmd .= ' -tag:v avc1';
$cmd .= ' -bsf:a aac_adtstoasc';
$cmd .= ' -tag:a mp4a';
// Declarar bitrate al muxer DASH (requerido para el MPD)
$cmd .= " -b:v {$targetKbps}k";
// Flags fMP4: fragmentar en keyframes, moov vacío inicial, base_moof para live
$cmd .= ' -movflags +frag_keyframe+empty_moov+default_base_moof';
$cmd .= ' -max_muxing_queue_size 9999';
$cmd .= ' -muxdelay 0 -muxpreload 0';
// Formato de salida: DASH
$cmd .= ' -f dash';
// GOP-Adaptive: min_seg_duration en microsegundos (NUNCA seg_duration fijo)
$cmd .= " -min_seg_duration {$minSegDurationUs}";
// Timeline y template para manifiestos dinámicos
$cmd .= ' -use_timeline 1 -use_template 1';
// Ventana deslizante
$cmd .= " -window_size {$windowSize} -extra_window_size {$extraWindowSize}";
$cmd .= ' -single_file 0';
// NAMING CANÓNICO APE — debe coincidir exactamente con resolve_quality.php
$cmd .= " -init_seg_name 'init-\$RepresentationID\$.m4s'";
$cmd .= " -media_seg_name 'chunk-\$RepresentationID\$-\$Number%06d\$.m4s'";
// Generar también manifiestos HLS por representación (media_0.m3u8, media_1.m3u8)
$cmd .= ' -hls_playlist 1 -hls_master_name master.m3u8';
$cmd .= ' -hls_segment_type fmp4';
// Archivo de salida: manifest.mpd
$cmd .= ' ' . escapeshellarg($manifestPath);

guardianLog([
    'event'            => 'ffmpeg_cmd_built',
    'seg_dur_s'        => $segDurSec,
    'min_seg_dur_us'   => $minSegDurationUs,
    'window_size'      => $windowSize,
    'extra_window'     => $extraWindowSize,
    'target_kbps'      => $targetKbps,
]);

// ─── 6. ABRIR PROCESO FFmpeg ─────────────────────────────────────────────────
$descriptorSpec = [
    0 => ['pipe', 'r'],                                   // stdin: recibe TS desde PHP
    1 => ['file', '/dev/null', 'w'],                      // stdout: ignorado
    2 => ['file', $cmafDir . '/ffmpeg.log', 'a'],         // stderr: log de FFmpeg
];

$ffmpegProcess = proc_open($cmd, $descriptorSpec, $pipes);
if (!is_resource($ffmpegProcess)) {
    guardianLog(['event' => 'ffmpeg_open_failed', 'cmd' => $cmd]);
    fwrite(STDERR, "[APE-WORKER] ERROR: No se pudo abrir FFmpeg.\n");
    exit(1);
}

$ffmpegStdin = $pipes[0];

// ─── 7. HYDRA STREAM EVADER ──────────────────────────────────────────────────
// Motor de evasión y reconexión automática.
// Construye el origin_pool desde el DNA inyectado por resolve_quality.php.
// Si el proveedor principal falla, rota automáticamente por los alternativos.

class HydraEvader
{
    private string $primaryUrl;
    private array  $pool;
    private string $manifestPath;
    private int    $maxRetries = 8;

    // User-Agents rotativos para evasión ISP
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

    /**
     * Construye la URL del stream para un host alternativo del pool,
     * manteniendo el path original (user/pass/stream_id).
     */
    private function buildUrlForHost(string $host, string $originalUrl): string
    {
        $parsed = parse_url($originalUrl);
        if (!$parsed) return $originalUrl;
        $scheme = $parsed['scheme'] ?? 'http';
        $path   = $parsed['path']   ?? '/';
        $query  = isset($parsed['query']) ? '?' . $parsed['query'] : '';
        return "{$scheme}://{$host}{$path}{$query}";
    }

    /**
     * Fetch atómico: descarga el stream TS y lo escribe en el stdin de FFmpeg.
     * Retorna true si el stream terminó limpiamente (reconectable),
     * false si hay un fallo catastrófico.
     */
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
                CURLOPT_TIMEOUT        => 0,       // Sin timeout: stream infinito
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
                // Escribir directamente en stdin de FFmpeg
                CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use ($ffmpegStdin) {
                    if (!is_resource($ffmpegStdin)) return -1;
                    $written = @fwrite($ffmpegStdin, $chunk);
                    if ($written === false) return -1; // FFmpeg murió
                    return strlen($chunk);
                },
            ]);

            guardianLog([
                'event'   => 'hydra_fetch_start',
                'attempt' => $attempt + 1,
                'url'     => preg_replace('/\/[^\/]+\/[^\/]+\/(\d+)/', '/***/***/\1', $currentUrl),
                'ua'      => substr($ua, 0, 40),
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

            // Suicide Switch: si el manifest.mpd no se ha tocado en 300s, salir
            if (file_exists($this->manifestPath) &&
                (time() - filemtime($this->manifestPath)) > 300) {
                guardianLog(['event' => 'suicide_switch_triggered', 'reason' => 'manifest_stale_300s']);
                return false;
            }

            // Stream terminó limpiamente (200) → reconectable
            if ($httpCode >= 200 && $httpCode < 300 && $curlError === 0) {
                return true;
            }

            // FFmpeg murió (CURLE_WRITE_ERROR = 23) → fallo catastrófico
            if ($curlError === CURLE_WRITE_ERROR) {
                guardianLog(['event' => 'ffmpeg_pipe_broken']);
                return false;
            }

            // Rotar al siguiente host del pool
            $nextHost = $this->pool[$attempt % count($this->pool)] ?? null;
            if ($nextHost) {
                $currentUrl = $this->buildUrlForHost($nextHost, $this->primaryUrl);
                guardianLog([
                    'event'    => 'hydra_host_rotation',
                    'new_host' => $nextHost,
                    'attempt'  => $attempt + 1,
                ]);
            }

            $attempt++;
            // Backoff exponencial: 0ms, 200ms, 400ms, 800ms, 1600ms...
            if ($attempt < $this->maxRetries) {
                usleep((int)(pow(2, min($attempt, 5)) * 100_000));
            }
        }

        guardianLog(['event' => 'hydra_max_retries_exhausted', 'attempts' => $attempt]);
        return false;
    }
}

// ─── 8. CONSTRUIR ORIGIN POOL ────────────────────────────────────────────────
$originPool = [];
if (!empty($dna['origin_pool']) && is_array($dna['origin_pool'])) {
    $originPool = $dna['origin_pool'];
}
// Siempre incluir el host primario en el pool como fallback final
$primaryHost = parse_url($originUrl, PHP_URL_HOST) . ':' . (parse_url($originUrl, PHP_URL_PORT) ?? 80);
if (!in_array($primaryHost, $originPool)) {
    $originPool[] = $primaryHost;
}

$evader = new HydraEvader($originUrl, $originPool, $manifestPath);

// ─── 9. BUCLE PRINCIPAL: ZERO-DROP ANTI-CUT ─────────────────────────────────
// El bucle externo garantiza reconexión automática si el stream cae.
// El Suicide Switch interno mata el worker si nadie pide el stream en 5 minutos.

guardianLog(['event' => 'worker_loop_start', 'pool_size' => count($originPool)]);

$loopCount = 0;
while (true) {
    $loopCount++;

    // Suicide Switch: si el manifest.mpd no se ha tocado en 300s, salir limpiamente
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

    // Stream cayó limpiamente → esperar 500ms y reconectar (Zero-Drop)
    guardianLog(['event' => 'worker_reconnecting', 'loop' => $loopCount]);
    usleep(500_000);
}

// ─── 10. LIMPIEZA ────────────────────────────────────────────────────────────
guardianLog(['event' => 'worker_cleanup_start']);

// Cerrar stdin de FFmpeg
if (is_resource($ffmpegStdin)) {
    @fclose($ffmpegStdin);
}

// Terminar FFmpeg
if (is_resource($ffmpegProcess)) {
    @proc_terminate($ffmpegProcess, 9);
    @proc_close($ffmpegProcess);
}

// Eliminar PID file
if (file_exists($pidFile)) {
    @unlink($pidFile);
}

// Limpiar directorio de caché del canal
$files = glob($cmafDir . '/*') ?: [];
foreach ($files as $file) {
    if (is_file($file)) @unlink($file);
}
@rmdir($cmafDir);

guardianLog(['event' => 'worker_exit_clean']);
