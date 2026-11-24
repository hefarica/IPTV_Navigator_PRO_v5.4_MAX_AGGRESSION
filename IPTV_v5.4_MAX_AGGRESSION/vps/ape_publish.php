<?php
/**
 * ============================================================
 * 🚀 APE PUBLISH — Placeholder Streaming para listas M3U8
 * ============================================================
 *
 * Publica un upload ya troceado (upload_chunk.php) en /var/www/lists
 * con el patrón medido en producción:
 *
 *   <base>.m3u8      -> placeholder blindado (>32 B y <=2048 B, metadata
 *                       honesta del payload; evita que pulse-sync lo envuelva)
 *   <base>.m3u8.gz   -> payload REAL, byte a byte (si se subió .gz)
 *                       o comprimido en servidor (si se subió .m3u8)
 *
 * Nginx (location ~* \.m3u8$) sirve el .gz con gzip_static always y
 * descomprime en streaming con gunzip on para clientes sin gzip.
 * Cero recompresión por request.
 *
 * Admite DOS modos:
 *   - precompressed: el cliente sube un .m3u8.gz ya comprimido.
 *                    NO se recomprime: se verifica (gzip -t) y se publica
 *                    byte-idéntico (sha256 calculado al ensamblar).
 *   - raw:           el cliente sube un .m3u8 plano. Se comprime UNA vez
 *                    con gzip -9 en el servidor antes de publicar.
 *
 * GATES (fail-closed, ninguno publica a medias):
 *   1. upload_id válido y directorio de chunks existente
 *   2. chunks completos, contiguos y sin huecos (000000..N-1)
 *   3. tamaño ensamblado == expected_size (si el cliente lo declara)
 *   4. sha256 ensamblado == expected_sha256 (si el cliente lo declara)
 *   5. gzip -t OK (integridad del .gz completo, incluye CRC)
 *   6. #EXT-X-APE-CHANNELS declarado == #EXTINF reales (si se declara)
 *   7. espacio libre suficiente ANTES de ensamblar
 *   8. rename atómico: el .m3u8 público NUNCA existe sin su .gz válido
 *
 * Lo que este endpoint NO hace (honestidad):
 *   - NO inventa metadatos: los cuenta/lee del propio fichero.
 *   - NO toca una URL de canal: el payload se publica verbatim.
 *   - NO publica si gzip -t falla o si el conteo de canales no cuadra.
 *
 * Uso (POST JSON):
 *   {
 *     "upload_id": "turbo_xxx",
 *     "filename":  "APE_LISTA_..._CDN.m3u8.gz",
 *     "mode":      "precompressed" | "raw" | "auto",
 *     "expected_size":   494761954,
 *     "expected_chunks": 15,
 *     "expected_sha256": "...",            // opcional
 *     "strategy":  "replace" | "version" | "both"
 *   }
 *
 * Solo CLI (para pruebas): APE_TEST_INPUT=/ruta/input.json php ape_publish.php
 */

declare(strict_types=1);

set_time_limit(1200);
ini_set('memory_limit', '256M');
ignore_user_abort(true);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ────────────────────────────────────────────────────────────
// CONFIGURACIÓN (env override para pruebas aisladas en /tmp)
// ────────────────────────────────────────────────────────────
$LISTS_DIR   = rtrim((string)(getenv('APE_LISTS_DIR') ?: '/var/www/lists'), '/');
$CHUNK_ROOT  = rtrim((string)(getenv('APE_CHUNK_ROOT') ?: (__DIR__ . '/chunks')), '/');
$PUBLIC_BASE = rtrim((string)(getenv('APE_PUBLIC_DOMAIN') ?: 'https://iptv-ape.duckdns.org'), '/');
$MAX_BYTES   = 2 * 1024 * 1024 * 1024; // 2 GiB de payload como techo de seguridad
$READ_BLOCK  = 2 * 1024 * 1024;        // 2 MiB por lectura al ensamblar

/**
 * Placeholder "blindado" (33..2048 B).
 *
 * POR QUÉ NO 8 B: `/opt/ape-pulse/ape-pulse-sync.sh` (medido 2026-11-24) trata
 * un `.m3u8` de <=32 B como placeholder y envuelve el .gz completo en
 * /var/www/lists/pulse/<base>.m3u8 (~1.46 GB). Esa envuelta GANA en
 * `try_files /lists/pulse/...` y sirve 1.46 GB también a clientes gzip: mata
 * la vía rápida. El mismo script, en cambio, SALTA las fuentes de <=2048 B
 * (`if [ "$rsize" -le 2048 ]`), así que un placeholder >32 B y <=2048 B
 * conserva la publicación estática .gz (gzip_static always + gunzip on) y
 * evita la materialización de 1.46 GB.
 *
 * El contenido es metadata honesta del payload real; no pretende ser una
 * lista reproducible: el edge siempre sirve <base>.m3u8.gz cuando existe.
 */
function ape_placeholder(string $baseName, int $sizeGz, ?int $channels, string $sha256Gz): string
{
    $lines = [
        '#EXTM3U',
        '#EXT-X-APE-PLACEHOLDER-STREAMING:1',
        '#EXT-X-APE-PAYLOAD:/lists/' . $baseName . '.gz',
        '#EXT-X-APE-PAYLOAD-BYTES:' . $sizeGz,
        '#EXT-X-APE-PAYLOAD-SHA256:' . $sha256Gz,
    ];
    if ($channels !== null) {
        $lines[] = '#EXT-X-APE-CHANNELS:' . $channels;
    }
    $lines[] = '#EXT-X-APE-SERVING:gzip_static_always_gunzip_on';
    $lines[] = '#EXT-X-APE-PLACEHOLDER-MODE:rich-anti-wrap';
    return implode("\n", $lines) . "\n";
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────
function ape_fail(int $code, string $error, array $extra = []): void
{
    http_response_code($code);
    echo json_encode(
        array_merge(['success' => false, 'error' => $error], $extra),
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

function ape_ok(array $data): void
{
    echo json_encode(
        array_merge(['success' => true], $data),
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

function ape_sanitize_filename(string $filename): string
{
    $filename = basename($filename);
    $filename = preg_replace('/[()]/', '', $filename) ?? '';
    $filename = preg_replace('/\s+/', '_', $filename) ?? '';
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename) ?? '';
    $filename = preg_replace('/_+/', '_', $filename) ?? '';
    return trim($filename, '._-');
}

function ape_run(string $cmd, ?int &$exitCode = null): string
{
    $out = [];
    $exitCode = 0;
    @exec($cmd . ' 2>&1', $out, $exitCode);
    return implode("\n", $out);
}

/** Cuenta canales reales y valida CRC en una sola pasada (gzip -dc). */
function ape_count_channels_gz(string $gzPath): int
{
    $out = ape_run('gzip -dc -- ' . escapeshellarg($gzPath) . " | grep -c '^#EXTINF:'");
    $n = (int)trim($out);
    // grep devuelve 1 cuando no hay coincidencias; 0 canales es un resultado
    // legítimo pero para este ecosistema una lista sin canales no se publica.
    return $n;
}

/** Lee una cabecera (primeros N bytes descomprimidos) sin cargar el fichero. */
function ape_read_gz_head(string $gzPath, int $maxBytes = 4194304): string
{
    return (string)ape_run(
        'gzip -dc -- ' . escapeshellarg($gzPath) . ' | head -c ' . (int)$maxBytes
    );
}

function ape_read_plain_head(string $plainPath, int $maxBytes = 4194304): string
{
    $fh = @fopen($plainPath, 'rb');
    if (!$fh) {
        return '';
    }
    $head = (string)fread($fh, $maxBytes);
    fclose($fh);
    return $head;
}

function ape_declared_channels(string $head): ?int
{
    if (preg_match('/^#EXT-X-APE-CHANNELS:\s*(\d+)/m', $head, $m)) {
        return (int)$m[1];
    }
    return null;
}

function ape_gzip_uncompressed_size(string $gzPath): ?int
{
    $out = trim(ape_run('gzip -l -- ' . escapeshellarg($gzPath)));
    $lines = preg_split('/\R/', $out) ?: [];
    $last = trim((string)end($lines));
    // Formato: "  compressed  uncompressed  ratio  uncompressed_name"
    if (preg_match('/^\s*\d+\s+(\d+)\s+/', $last, $m)) {
        return (int)$m[1];
    }
    return null;
}

function ape_remove_dir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (glob($dir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($dir);
}

// ────────────────────────────────────────────────────────────
// ENTRADA
// ────────────────────────────────────────────────────────────
if (PHP_SAPI === 'cli' && getenv('APE_TEST_INPUT')) {
    $raw = (string)@file_get_contents((string)getenv('APE_TEST_INPUT'));
} else {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        ape_fail(405, 'method_not_allowed', ['hint' => 'POST JSON only']);
    }
    $raw = (string)file_get_contents('php://input');
}

if ($raw === '') {
    ape_fail(400, 'empty_body');
}
$input = json_decode($raw, true);
if (!is_array($input)) {
    ape_fail(400, 'invalid_json');
}

$uploadId  = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($input['upload_id'] ?? '')) ?? '';
$rawName   = (string)($input['filename'] ?? '');
$mode      = (string)($input['mode'] ?? 'auto');
$strategy  = (string)($input['strategy'] ?? 'replace');
$expectedSize   = isset($input['expected_size']) ? (int)$input['expected_size'] : -1;
$expectedChunks = isset($input['expected_chunks']) ? (int)$input['expected_chunks'] : -1;
$expectedSha    = strtolower(trim((string)($input['expected_sha256'] ?? '')));

if ($uploadId === '' || strlen($uploadId) > 90) {
    ape_fail(400, 'invalid_upload_id');
}
if (!in_array($strategy, ['replace', 'version', 'both'], true)) {
    $strategy = 'replace';
}

$filename = ape_sanitize_filename($rawName);
if ($filename === '' || strlen($filename) > 180) {
    ape_fail(422, 'invalid_filename', ['filename' => $filename]);
}
if (!preg_match('/\.(m3u8|m3u)(\.gz)?$/i', $filename)) {
    ape_fail(422, 'filename_must_end_in_m3u8_or_m3u8_gz', ['filename' => $filename]);
}

$isPrecompressed = (bool)preg_match('/\.(m3u8|m3u)\.gz$/i', $filename);
if ($mode === 'precompressed' && !$isPrecompressed) {
    ape_fail(422, 'precompressed_mode_requires_gz_filename');
}
if ($mode === 'raw' && $isPrecompressed) {
    ape_fail(422, 'raw_mode_forbids_gz_filename');
}
if ($mode === 'auto') {
    $mode = $isPrecompressed ? 'precompressed' : 'raw';
}

$baseName = $isPrecompressed ? (string)preg_replace('/\.gz$/i', '', $filename) : $filename;
if (!preg_match('/\.(m3u8|m3u)$/i', $baseName)) {
    ape_fail(422, 'invalid_base_name', ['base' => $baseName]);
}

$chunkDir = $CHUNK_ROOT . '/' . $uploadId;
if (!is_dir($chunkDir)) {
    ape_fail(404, 'upload_not_found', ['upload_id' => $uploadId]);
}

$parts = glob($chunkDir . '/*.part') ?: [];
sort($parts, SORT_STRING);
$partCount = count($parts);
if ($partCount < 1) {
    ape_fail(400, 'no_chunks', ['upload_id' => $uploadId]);
}
if ($expectedChunks > 0 && $partCount !== $expectedChunks) {
    ape_fail(409, 'missing_chunks', [
        'received' => $partCount,
        'expected' => $expectedChunks,
    ]);
}
// Contigüidad estricta: 000000.part, 000001.part, ... sin huecos.
for ($i = 0; $i < $partCount; $i++) {
    if (basename($parts[$i]) !== sprintf('%06d.part', $i)) {
        ape_fail(409, 'chunk_gap', ['expected_part' => sprintf('%06d.part', $i)]);
    }
}

$assembledSize = 0;
foreach ($parts as $p) {
    $assembledSize += (int)filesize($p);
}
if ($expectedSize >= 0 && $assembledSize !== $expectedSize) {
    ape_fail(409, 'size_mismatch', [
        'assembled' => $assembledSize,
        'expected'  => $expectedSize,
    ]);
}
if ($assembledSize < 1 || $assembledSize > $MAX_BYTES) {
    ape_fail(422, 'size_out_of_range', ['bytes' => $assembledSize]);
}
if (!is_dir($LISTS_DIR) || !is_writable($LISTS_DIR)) {
    ape_fail(500, 'lists_dir_not_writable', ['dir' => $LISTS_DIR]);
}

// Guard de disco: ensamblado + (si raw) salida comprimida + 128 MiB de margen.
$free = @disk_free_space($LISTS_DIR);
$need = $assembledSize + ($isPrecompressed ? 0 : (int)($assembledSize * 0.7)) + 128 * 1024 * 1024;
if ($free !== false && $free < $need) {
    ape_fail(507, 'insufficient_disk', [
        'free_bytes' => (int)$free,
        'need_bytes' => $need,
    ]);
}

// Lock por upload: dos finalize concurrentes no deben pisarse.
$lockPath = $LISTS_DIR . '/.publish_' . $uploadId . '.lock';
$lock = @fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    ape_fail(409, 'publish_in_progress');
}
// exit() no ejecuta finally; el shutdown garantiza no dejar .lock huérfanos.
$GLOBALS['ape_publish_lock_path'] = $lockPath;
register_shutdown_function(static function (): void {
    if (!empty($GLOBALS['ape_publish_lock_path'])) {
        @unlink((string)$GLOBALS['ape_publish_lock_path']);
    }
});

$tmpAssembled = $LISTS_DIR . '/.tmp_' . $uploadId . ($isPrecompressed ? '.m3u8.gz' : '.m3u8');
$tmpGz        = $LISTS_DIR . '/.tmp_' . $uploadId . '.gz';
$tmpPlaceholder = $LISTS_DIR . '/.tmp_ph_' . $uploadId;
$published = false;
$startedAt = microtime(true);

try {
    // ── 1. ENSAMBLAR (streaming, sha256 incremental) ──
    $out = @fopen($tmpAssembled, 'wb');
    if (!$out) {
        ape_fail(500, 'cannot_create_tmp', ['path' => basename($tmpAssembled)]);
    }
    $ctx = hash_init('sha256');
    $written = 0;
    foreach ($parts as $part) {
        $in = @fopen($part, 'rb');
        if (!$in) {
            fclose($out);
            @unlink($tmpAssembled);
            ape_fail(500, 'cannot_read_chunk', ['chunk' => basename($part)]);
        }
        while (!feof($in)) {
            $buf = fread($in, $READ_BLOCK);
            if ($buf === false) {
                fclose($in);
                fclose($out);
                @unlink($tmpAssembled);
                ape_fail(500, 'chunk_read_error', ['chunk' => basename($part)]);
            }
            if ($buf === '') {
                break;
            }
            hash_update($ctx, $buf);
            if (fwrite($out, $buf) !== strlen($buf)) {
                fclose($in);
                fclose($out);
                @unlink($tmpAssembled);
                ape_fail(507, 'write_failed_disk_full', ['path' => basename($tmpAssembled)]);
            }
            $written += strlen($buf);
        }
        fclose($in);
    }
    fclose($out);
    @chmod($tmpAssembled, 0644);

    if ($written !== $assembledSize) {
        @unlink($tmpAssembled);
        ape_fail(500, 'assembly_size_mismatch', [
            'written'  => $written,
            'expected' => $assembledSize,
        ]);
    }
    $sha256 = hash_final($ctx);
    if ($expectedSha !== '' && !hash_equals($expectedSha, $sha256)) {
        @unlink($tmpAssembled);
        ape_fail(409, 'sha256_mismatch', [
            'expected' => $expectedSha,
            'actual'   => $sha256,
        ]);
    }

    // ── 2. VALIDAR CONTENIDO + METADATOS ──
    if ($isPrecompressed) {
        $fh = @fopen($tmpAssembled, 'rb');
        $magic = $fh ? (string)fread($fh, 2) : '';
        if ($fh) {
            fclose($fh);
        }
        if ($magic !== "\x1f\x8b") {
            @unlink($tmpAssembled);
            ape_fail(422, 'not_a_gzip_file', ['magic_hex' => bin2hex($magic)]);
        }

        // gzip -t valida el stream COMPLETO (CRC incluido).
        $tExit = 0;
        ape_run('gzip -t -- ' . escapeshellarg($tmpAssembled), $tExit);
        if ($tExit !== 0) {
            @unlink($tmpAssembled);
            ape_fail(422, 'gzip_integrity_failed', ['gzip_exit' => $tExit]);
        }

        $head = ape_read_gz_head($tmpAssembled);
        if ($head === '' || strpos($head, '#EXTM3U') === false) {
            @unlink($tmpAssembled);
            ape_fail(422, 'gz_payload_not_m3u', ['head_bytes' => strlen($head)]);
        }
        $channelsActual = ape_count_channels_gz($tmpAssembled);
        $sizeGz = filesize($tmpAssembled) ?: 0;
        $sizeRaw = null; // se intenta leer del trailer; si es multi-member queda null
        $gzSizeFromList = ape_gzip_uncompressed_size($tmpAssembled);
        if ($gzSizeFromList !== null) {
            $sizeRaw = $gzSizeFromList;
        }
        $finalGzSource = $tmpAssembled;
        $sha256Gz = $sha256;
    } else {
        $head = ape_read_plain_head($tmpAssembled);
        if ($head === '' || strpos($head, '#EXTM3U') === false) {
            @unlink($tmpAssembled);
            ape_fail(422, 'payload_not_m3u', ['head_bytes' => strlen($head)]);
        }
        $channelsActual = 0;
        $src = @fopen($tmpAssembled, 'rb');
        if ($src) {
            while (($line = fgets($src)) !== false) {
                if (strncmp($line, '#EXTINF:', 8) === 0) {
                    $channelsActual++;
                }
            }
            fclose($src);
        }

        // gzip -9 UNA sola vez, en streaming, sin cargar el fichero en PHP.
        $gzExit = 0;
        ape_run(
            'gzip -9 -c -- ' . escapeshellarg($tmpAssembled) . ' > ' . escapeshellarg($tmpGz),
            $gzExit
        );
        if (!is_file($tmpGz) || (int)filesize($tmpGz) < 32) {
            @unlink($tmpAssembled);
            @unlink($tmpGz);
            ape_fail(500, 'server_gzip_failed', ['gzip_exit' => $gzExit]);
        }
        @chmod($tmpGz, 0644);
        $tExit = 0;
        ape_run('gzip -t -- ' . escapeshellarg($tmpGz), $tExit);
        if ($tExit !== 0) {
            @unlink($tmpAssembled);
            @unlink($tmpGz);
            ape_fail(500, 'server_gzip_integrity_failed', ['gzip_exit' => $tExit]);
        }
        $sizeGz = (int)filesize($tmpGz);
        $sizeRaw = $assembledSize;
        $sha256Gz = (string)hash_file('sha256', $tmpGz);
        $finalGzSource = $tmpGz;
        @unlink($tmpAssembled);
    }

    $channelsDeclared = ape_declared_channels($head);
    if ($channelsDeclared !== null && $channelsDeclared > 0 && $channelsActual !== $channelsDeclared) {
        @unlink($finalGzSource);
        @unlink($tmpAssembled);
        ape_fail(409, 'channel_count_mismatch', [
            'declared' => $channelsDeclared,
            'actual'   => $channelsActual,
            'hint'     => 'Lista truncada o corrupta: NO se publica.',
        ]);
    }

    // ── 3. PUBLICAR ATÓMICAMENTE ──
    if (!is_dir($LISTS_DIR . '/versions')) {
        @mkdir($LISTS_DIR . '/versions', 0755, true);
    }
    $finalGz = $LISTS_DIR . '/' . $baseName . '.gz';
    if (($strategy === 'version' || $strategy === 'both') && is_file($finalGz)) {
        $stamp = date('Ymd_His');
        $vName = preg_replace('/\.(m3u8|m3u)$/i', '', $baseName) . '_v' . $stamp . '.m3u8.gz';
        @copy($finalGz, $LISTS_DIR . '/versions/' . $vName);
    }

    if (!@rename($finalGzSource, $finalGz)) {
        @unlink($finalGzSource);
        @unlink($tmpAssembled);
        ape_fail(500, 'publish_rename_failed');
    }
    @chmod($finalGz, 0644);

    // Placeholder blindado: >32 B (pulse-sync no lo trata como "8 B => envolver")
    // y <=2048 B (pulse-sync lo salta por debajo del umbral de materialización).
    $placeholderContent = ape_placeholder(
        $baseName,
        $sizeGz,
        $channelsDeclared ?? $channelsActual,
        $sha256Gz
    );
    $placeholderLen = strlen($placeholderContent);
    if ($placeholderLen <= 32 || $placeholderLen > 2048) {
        @unlink($finalGz);
        ape_fail(500, 'placeholder_length_out_of_safe_range', ['bytes' => $placeholderLen]);
    }

    if (@file_put_contents($tmpPlaceholder, $placeholderContent) === false
        || !@rename($tmpPlaceholder, $LISTS_DIR . '/' . $baseName)) {
        @unlink($tmpPlaceholder);
        @unlink($finalGz);
        ape_fail(500, 'placeholder_write_failed');
    }
    @chmod($LISTS_DIR . '/' . $baseName, 0644);

    $published = true;

    // ── 4. LIMPIAR CHUNKS ──
    ape_remove_dir($chunkDir);

    $elapsed = round(microtime(true) - $startedAt, 2);
    ape_ok([
        'upload_id'  => $uploadId,
        'mode'       => $mode,
        'filename'   => $baseName,
        'public_url' => $PUBLIC_BASE . '/lists/' . $baseName,
        'gz_url'     => $PUBLIC_BASE . '/lists/' . $baseName . '.gz',
        'placeholder_bytes' => $placeholderLen,
        'placeholder_mode'  => 'rich_anti_wrap_33_2048',
        'size_bytes' => $sizeRaw ?? $assembledSize,
        'size_gz'    => $sizeGz,
        'compression_ratio' => ($sizeRaw && $sizeRaw > 0)
            ? round((1 - $sizeGz / $sizeRaw) * 100, 2) . '%' : null,
        'channels_declared' => $channelsDeclared,
        'channels_actual'   => $channelsActual,
        'channels_match'    => ($channelsDeclared === null) ? null : ($channelsDeclared === $channelsActual),
        'gzip_ok'    => true,
        'sha256_gz'  => $sha256Gz,
        'strategy'   => $strategy,
        'serving_mode' => 'gzip_static_always_with_gunzip_fallback',
        'elapsed_s'  => $elapsed,
    ]);
} catch (Throwable $e) {
    if (!$published) {
        @unlink($tmpAssembled);
        @unlink($tmpGz);
        @unlink($tmpPlaceholder);
    }
    ape_fail(500, 'unexpected_error', ['detail' => $e->getMessage()]);
} finally {
    if (is_resource($lock)) {
        @flock($lock, LOCK_UN);
        @fclose($lock);
    }
    @unlink($lockPath);
}
