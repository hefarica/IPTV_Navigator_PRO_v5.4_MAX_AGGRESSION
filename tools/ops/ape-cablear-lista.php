<?php
declare(strict_types=1);

/**
 * ape-cablear-lista.php — cableado local, streaming y fail-closed de listas APE.
 *
 * Uso:
 *   php ape-cablear-lista.php <in.gz|in.m3u8> <out> [base] [device]
 *
 * El motor no descarga proveedores, no cambia codecs/perfiles/HDR/buffers y no
 * añade etiquetas HLS. Los catálogos se transforman línea a línea; un master o
 * media HLS genuino se copia byte a byte. La memoria de trabajo depende de la
 * línea más larga, no del número de canales.
 */

const APE_CABLEAR_DEFAULT_BASE = 'https://iptv-ape.duckdns.org';
const APE_CABLEAR_DEFAULT_DEVICE = 'eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9';

/** @throws RuntimeException */
function ape_cablear_error(string $message): never
{
    throw new RuntimeException($message);
}

function ape_cablear_parse_url(string $url): ?array
{
    try {
        $parts = parse_url($url);
    } catch (Throwable $e) {
        return null;
    }
    return is_array($parts) ? $parts : null;
}

/**
 * Valida el contrato que pulse.php aplica al parámetro u=.
 * El pipe queda fuera: no forma parte de la URL HTTP entregada al consumidor.
 */
function ape_cablear_source_url_valid(string $url): bool
{
    if ($url === '' || strlen($url) > 2000) {
        return false;
    }
    if (preg_match('/[\x00-\x20\x7F\x22\x27\x3C\x3E\\\\]/', $url)) {
        return false;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return false;
    }
    $parts = ape_cablear_parse_url($url);
    return $parts !== null && !empty($parts['host']);
}

/** @throws RuntimeException */
function ape_cablear_validate_base(string $base): string
{
    if ($base === '' || preg_match('/[\x00-\x20\x7F\x22\x27\x3C\x3E\\\\]/', $base)) {
        ape_cablear_error('base invalida: debe ser http(s) sin credenciales, query ni fragmento');
    }
    if (!preg_match('#^https?://#i', $base)) {
        ape_cablear_error('base invalida: esquema http(s) requerido');
    }
    $parts = ape_cablear_parse_url($base);
    if ($parts === null || empty($parts['host'])) {
        ape_cablear_error('base invalida: falta host');
    }
    if (array_key_exists('user', $parts) || array_key_exists('pass', $parts)) {
        ape_cablear_error('base invalida: no admite usuario ni contraseña');
    }
    if (strpos($base, '?') !== false || strpos($base, '#') !== false
        || array_key_exists('query', $parts) || array_key_exists('fragment', $parts)) {
        ape_cablear_error('base invalida: no admite query ni fragmento');
    }
    return rtrim($base, '/');
}

function ape_cablear_line_parts(string $raw): array
{
    $length = strlen($raw);
    if ($length >= 2 && substr($raw, -2) === "\r\n") {
        return [substr($raw, 0, -2), "\r\n"];
    }
    if ($length >= 1 && ($raw[$length - 1] === "\n" || $raw[$length - 1] === "\r")) {
        return [substr($raw, 0, -1), $raw[$length - 1]];
    }
    return [$raw, ''];
}

function ape_cablear_open_input(string $path, bool $gzip)
{
    if ($gzip) {
        $handle = @gzopen($path, 'rb');
    } else {
        $handle = @fopen($path, 'rb');
    }
    if ($handle === false) {
        ape_cablear_error('no puedo abrir la entrada');
    }
    return $handle;
}

function ape_cablear_read_line($handle, bool $gzip): ?string
{
    $line = $gzip ? @gzgets($handle) : @fgets($handle);
    return $line === false ? null : $line;
}

function ape_cablear_close_input($handle, bool $gzip): void
{
    $ok = $gzip ? @gzclose($handle) : @fclose($handle);
    if ($ok === false) {
        ape_cablear_error('fallo leyendo la entrada');
    }
}

/** gzip -t valida CRC/ISIZE antes de crear cualquier salida. */
function ape_cablear_validate_gzip(string $path): void
{
    if (!function_exists('exec')) {
        ape_cablear_error('no puedo validar CRC gzip: exec no disponible');
    }
    $status = 1;
    $ignored = [];
    @exec('gzip -t -- ' . escapeshellarg($path) . ' 2>/dev/null', $ignored, $status);
    if ($status !== 0) {
        ape_cablear_error('gzip corrupto o no validable');
    }
}

function ape_cablear_logical_extension(string $path): string
{
    $name = strtolower(basename($path));
    if (substr($name, -3) === '.gz') {
        $name = substr($name, 0, -3);
    }
    return substr($name, -5) === '.m3u8' ? 'm3u8' : 'm3u';
}

function ape_cablear_is_extinf(string $body): bool
{
    return (bool)preg_match('/^[ \t]*#EXTINF[ \t]*:/i', $body);
}

function ape_cablear_extract_extinf_duration(string $body): ?float
{
    if (!preg_match('/^[ \t]*#EXTINF[ \t]*:[ \t]*(-?(?:\d+(?:\.\d*)?|\.\d+))/i', $body, $m)) {
        return null;
    }
    return (float)$m[1];
}

/**
 * La presencia de tvg/duration -1 es una señal de catálogo APE aunque también
 * haya tags #EXT-X-* auxiliares. Los atributos sólo existen antes de la primera
 * coma: el título libre no puede convertir un HLS media en catálogo.
 */
function ape_cablear_is_catalog_extinf(string $body): bool
{
    if (!ape_cablear_is_extinf($body)) {
        return false;
    }
    $duration = ape_cablear_extract_extinf_duration($body);
    $comma = strpos($body, ',');
    $attributes = $comma === false ? $body : substr($body, 0, $comma);
    return ($duration !== null && abs($duration + 1.0) < 0.000001)
        || (bool)preg_match('/\b(?:tvg-[a-z0-9_-]+|group-title|provider[-_]id|channel[-_]id)\s*=/i', $attributes);
}

/**
 * pulse.php no traduce estas capas al fetch del proveedor. Si aparecen entre
 * EXTINF y su URI, envolverla perdería las cabeceras; el llamador debe dejar la
 * URI directa y contarla como sin_id (fail-safe).
 */
function ape_cablear_is_channel_header_metadata(string $body): bool
{
    return (bool)preg_match('/^[ \t]*#EXTHTTP(?:[ \t]*:|[ \t]*$)/i', $body)
        || (bool)preg_match('/^[ \t]*#EXTVLCOPT:http-[^ \t:=]+[ \t]*[:=]/i', $body);
}

function ape_cablear_classify(string $path, bool $gzip): array
{
    $kind = 'catalog_' . ape_cablear_logical_extension($path);
    $firstNonEmpty = null;
    $hasExtM3u = false;
    $hasCatalogExtinf = false;
    $hasMasterTag = false;
    $hasMediaTag = false;
    $httpLines = 0;
    $nonTagLines = 0;

    $handle = ape_cablear_open_input($path, $gzip);
    while (($raw = ape_cablear_read_line($handle, $gzip)) !== null) {
        [$body] = ape_cablear_line_parts($raw);
        $analysis = $body;
        if ($firstNonEmpty === null && $analysis !== '') {
            $analysis = (strncmp($analysis, "\xEF\xBB\xBF", 3) === 0)
                ? substr($analysis, 3) : $analysis;
            if (trim($analysis) !== '') {
                $firstNonEmpty = ltrim($analysis, " \t");
            }
        }

        $trimmed = trim($analysis);
        if (preg_match('/^#EXTM3U(?:[ \t]|$)/i', $trimmed)) {
            $hasExtM3u = true;
        }
        if (ape_cablear_is_catalog_extinf($analysis)) {
            $hasCatalogExtinf = true;
        }
        if (preg_match('/^[ \t]*#EXT-X-(?:STREAM-INF|I-FRAME-STREAM-INF)[ \t]*:/i', $analysis)) {
            $hasMasterTag = true;
        }
        if (preg_match('/^[ \t]*#EXT-X-(?:TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE|MAP|KEY|ENDLIST|PLAYLIST-TYPE|PART|PRELOAD-HINT|SERVER-CONTROL|PART-INF)[ \t]*:/i', $analysis)) {
            $hasMediaTag = true;
        }
        if (preg_match('#^https?://#i', $analysis)) {
            $httpLines++;
        }
        if ($trimmed !== '' && $trimmed[0] !== '#') {
            $nonTagLines++;
        }
    }
    ape_cablear_close_input($handle, $gzip);

    /* Catálogo antes que HLS: APE puede conservar tags EXT-X-* como metadata. */
    if (!$hasCatalogExtinf && $hasExtM3u && $hasMasterTag) {
        $kind = 'hls_master';
    } elseif (!$hasCatalogExtinf && $hasExtM3u && $hasMediaTag) {
        /* #EXTINF:0/positivo solo es catálogo; exige estructura HLS media. */
        $kind = 'hls_media';
    } elseif (!$hasExtM3u && !$hasCatalogExtinf
        && $httpLines === 1 && $nonTagLines === 1) {
        $kind = 'simple_url';
    }

    return [
        'tipo_lista' => $kind,
        'lineas_clasificacion' => 0, // se cuenta de nuevo durante la escritura.
    ];
}

function ape_cablear_url_host_key(array $parts): string
{
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $port = isset($parts['port']) ? (int)$parts['port'] : (($scheme === 'https') ? 443 : 80);
    return $scheme . '://' . $host . ':' . $port;
}

function ape_cablear_is_verifiable_endpoint(string $url, string $base): bool
{
    $parts = ape_cablear_parse_url($url);
    $baseParts = ape_cablear_parse_url($base);
    if ($parts === null || $baseParts === null || ape_cablear_url_host_key($parts) !== ape_cablear_url_host_key($baseParts)) {
        return false;
    }
    $basePath = rtrim((string)($baseParts['path'] ?? ''), '/');
    $path = (string)($parts['path'] ?? '');
    $prefix = $basePath === '' ? '' : preg_quote($basePath, '#');
    $route = '#^' . $prefix . '/(pulse/[0-9]+\.m3u8|url2/[^/]+\.m3u8)$#i';
    if (!preg_match($route, $path)) {
        return false;
    }
    $query = [];
    parse_str((string)($parts['query'] ?? ''), $query);
    if (!isset($query['u']) || !is_string($query['u']) || $query['u'] === '') {
        return false;
    }
    /* Una URL YA envuelta se conserva aunque su u= supere el límite de 2000
     * caracteres o lleve pipes: ese límite decide si una fuente NUEVA puede
     * envolverse, no si un endpoint propio ya existe. Exigir aquí el límite
     * contaba como sin_id miles de canales ya cableados en una reejecución. */
    $source = ape_cablear_parse_url($query['u']);
    return $source !== null && !empty($source['host'])
        && preg_match('#^https?://#i', $query['u']) === 1;
}

function ape_cablear_is_already_wrapped(string $url, string $base): bool
{
    /* Sólo la ruta del endpoint en el host/base configurado cuenta como ALREADY. */
    return ape_cablear_is_verifiable_endpoint($url, $base);
}

function ape_cablear_provider_id(?string $descriptor): ?string
{
    if ($descriptor === null || $descriptor === '') {
        return null;
    }
    $patterns = [
        '/\b(?:tvg-id|provider[-_]id|channel[-_]id|service[-_]id)\s*=\s*(["\'])(.*?)\1/i',
        '/\b(?:tvg-id|provider[-_]id|channel[-_]id|service[-_]id)\s*=\s*([^,\s]+)/i',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $descriptor, $m)) {
            $value = trim(isset($m[2]) && (string)$m[2] !== '' ? (string)$m[2] : (string)$m[1]);
            if ($value !== '' && !preg_match('/[\x00-\x1F\x7F]/', $value)) {
                return $value;
            }
        }
    }
    return null;
}

function ape_cablear_numeric_url_id(string $url): ?string
{
    $parts = ape_cablear_parse_url($url);
    $path = is_array($parts) ? (string)($parts['path'] ?? '') : $url;
    if (preg_match('~/(\d+)\.(?:m3u8|ts|mp4)/?$~i', $path, $m)) {
        return $m[1];
    }
    return null;
}

function ape_cablear_derived_id(string $url): string
{
    /* 15 hex digits caben en un entero positivo de 64 bits y son sólo dígitos. */
    $value = hexdec(substr(hash('sha256', $url), 0, 15));
    if (!is_int($value) || $value <= 0) {
        return '1';
    }
    return (string)$value;
}

/** @throws RuntimeException */
function ape_cablear_write_all($handle, string $data, int &$bytes, $hash): void
{
    $length = strlen($data);
    $offset = 0;
    while ($offset < $length) {
        $written = @fwrite($handle, substr($data, $offset));
        if ($written === false || $written === 0) {
            ape_cablear_error('fallo escribiendo la salida');
        }
        $offset += $written;
    }
    if ($length > 0) {
        hash_update($hash, $data);
        $bytes += $length;
    }
}

function ape_cablear_same_inode(string $input, string $output): bool
{
    $a = @stat($input);
    $b = @stat($output);
    return is_array($a) && is_array($b)
        && isset($a['dev'], $a['ino'], $b['dev'], $b['ino'])
        && $a['dev'] === $b['dev'] && $a['ino'] === $b['ino'];
}

/** @throws RuntimeException */
function ape_cablear_open_output_temp(string $output, string &$tempPath)
{
    $dir = dirname($output);
    if (!is_dir($dir)) {
        ape_cablear_error('directorio de salida inexistente');
    }
    for ($i = 0; $i < 12; $i++) {
        try {
            $suffix = bin2hex(random_bytes(6));
        } catch (Throwable $e) {
            $suffix = (string)mt_rand();
        }
        $candidate = $output . '.tmp.' . getmypid() . '.' . $suffix;
        $handle = @fopen($candidate, 'x+b');
        if ($handle !== false) {
            $tempPath = $candidate;
            return $handle;
        }
    }
    ape_cablear_error('no puedo crear temporal de salida');
}

function ape_cablear_path_is_symlink(string $path): bool
{
    return is_link($path);
}

/** @throws Throwable */
function ape_cablear_run(string $input, string $output, string $base, string $device): array
{
    if (!is_file($input) || !is_readable($input)) {
        ape_cablear_error('no puedo leer la entrada');
    }
    if ($output === '') {
        ape_cablear_error('falta la salida');
    }
    if (ape_cablear_path_is_symlink($output)) {
        ape_cablear_error('salida rechazada: es un symlink');
    }
    if (is_dir($output)) {
        ape_cablear_error('salida rechazada: es un directorio');
    }
    if (ape_cablear_same_inode($input, $output)) {
        ape_cablear_error('salida rechazada: comparte inode con la entrada');
    }

    $base = ape_cablear_validate_base($base);
    $gzip = strtolower(substr($input, -3)) === '.gz';
    if ($gzip) {
        ape_cablear_validate_gzip($input);
    }
    $classification = ape_cablear_classify($input, $gzip);
    $tipo = (string)$classification['tipo_lista'];

    $temp = '';
    $fo = ape_cablear_open_output_temp($output, $temp);
    $inputHash = hash_init('sha256');
    $outputHash = hash_init('sha256');
    $metadataInputHash = hash_init('sha256');
    $metadataOutputHash = hash_init('sha256');
    $bytesIn = 0;
    $bytesOut = 0;
    $lineas = 0;
    $canales = 0;
    $envueltos = 0;
    $yaEstaban = 0;
    $sinId = 0;
    $correlacionDerivada = 0;
    $passthrough = 0;
    $descriptor = null;
    $channelHasHeaders = false;
    $fi = null;

    try {
        $fi = ape_cablear_open_input($input, $gzip);
        $isHls = ($tipo === 'hls_master' || $tipo === 'hls_media');
        while (($raw = ape_cablear_read_line($fi, $gzip)) !== null) {
            $lineas++;
            $bytesIn += strlen($raw);
            hash_update($inputHash, $raw);
            [$body, $eol] = ape_cablear_line_parts($raw);
            $analysisBody = ($lineas === 1 && strncmp($body, "\xEF\xBB\xBF", 3) === 0)
                ? substr($body, 3) : $body;
            $isHttpLine = (bool)preg_match('#^https?://#i', $body);
            if (!$isHttpLine) {
                hash_update($metadataInputHash, $raw);
            }

            if ($isHls) {
                $trimmed = trim($analysisBody);
                if ($trimmed !== '' && $trimmed[0] !== '#') {
                    $passthrough++;
                }
                ape_cablear_write_all($fo, $raw, $bytesOut, $outputHash);
                if (!$isHttpLine) {
                    hash_update($metadataOutputHash, $raw);
                }
                continue;
            }

            if (ape_cablear_is_extinf($analysisBody)) {
                $descriptor = $analysisBody;
                $channelHasHeaders = false;
            } elseif ($descriptor !== null && ape_cablear_is_channel_header_metadata($analysisBody)) {
                $channelHasHeaders = true;
            }
            if (!preg_match('#^https?://#i', $body)) {
                ape_cablear_write_all($fo, $raw, $bytesOut, $outputHash);
                hash_update($metadataOutputHash, $raw);
                continue;
            }

            $canales++;
            $pipe = strpos($body, '|');
            $url = $pipe === false ? $body : substr($body, 0, $pipe);
            $suffix = $pipe === false ? '' : substr($body, $pipe);

            /* No inventar transporte de headers: pulse.php no traduce pipes ni
             * #EXTHTTP/EXTVLCOPT:http-* al fetch. La URI directa es la única
             * representación segura disponible en este motor. */
            /* ALREADY va primero: un endpoint propio puede superar los 2000
             * caracteres por el u= codificado. No es una fuente nueva y no debe
             * contarse como sin_id ni volver a envolverse. */
            if (ape_cablear_is_already_wrapped($url, $base)) {
                $yaEstaban++;
                ape_cablear_write_all($fo, $raw, $bytesOut, $outputHash);
                continue;
            }
            if ($pipe !== false || $channelHasHeaders) {
                $sinId++;
                ape_cablear_write_all($fo, $raw, $bytesOut, $outputHash);
                continue;
            }

            if (!ape_cablear_source_url_valid($url)) {
                $sinId++;
                ape_cablear_write_all($fo, $raw, $bytesOut, $outputHash);
                continue;
            }

            $providerId = ape_cablear_provider_id($descriptor);
            $numericId = ($providerId !== null && preg_match('/^\d+$/', $providerId))
                ? $providerId : ape_cablear_numeric_url_id($url);
            $correlationId = $numericId;
            if ($correlationId === null) {
                $correlacionDerivada++;
                $correlationId = ape_cablear_derived_id($url);
            }
            $idQuery = $providerId !== null ? $providerId : $correlationId;
            $wrapped = $base . '/pulse/' . $correlationId . '.m3u8?u=' . rawurlencode($url)
                . '&d=' . rawurlencode($device) . '&id=' . rawurlencode($idQuery);
            ape_cablear_write_all($fo, $wrapped . $suffix . $eol, $bytesOut, $outputHash);
            $envueltos++;
        }

        if ($gzip) {
            /* gzip -t ya validó CRC; gzclose también debe cerrar correctamente. */
            if (!@gzclose($fi)) {
                ape_cablear_error('fallo cerrando gzip');
            }
        } elseif (!@feof($fi)) {
            ape_cablear_error('fallo leyendo la entrada');
        } else {
            @fclose($fi);
        }
        $fi = null;

        if (!@fflush($fo)) {
            ape_cablear_error('fallo haciendo flush de la salida');
        }
        $outputStat = @fstat($fo);
        if (!is_array($outputStat) || !isset($outputStat['size']) || (int)$outputStat['size'] !== $bytesOut) {
            ape_cablear_error('tamaño escrito no coincide con la salida');
        }
        if (!@fclose($fo)) {
            ape_cablear_error('fallo cerrando la salida');
        }
        $fo = null;

        /* Recheck antes del rename: nunca sustituir una ruta que se volvió symlink. */
        if (ape_cablear_path_is_symlink($output) || ape_cablear_same_inode($input, $temp)) {
            ape_cablear_error('salida rechazada durante publicación');
        }
        if (!@rename($temp, $output)) {
            ape_cablear_error('no puedo publicar la salida');
        }
        $temp = '';

        $summary = [
            'tipo_lista' => $tipo,
            'bytes_entrada' => $bytesIn,
            'bytes_salida' => $bytesOut,
            'sha256_entrada' => hash_final($inputHash),
            'sha256_salida' => hash_final($outputHash),
            'sha256_metadata_entrada' => hash_final($metadataInputHash),
            'sha256_metadata_salida' => hash_final($metadataOutputHash),
            'lineas' => $lineas,
            'canales' => $canales,
            'envueltos' => $envueltos,
            'ya_estaban' => $yaEstaban,
            'sin_id' => $sinId,
            'correlacion_derivada' => $correlacionDerivada,
            'passthrough' => $passthrough,
        ];
        return $summary;
    } catch (Throwable $e) {
        if (is_resource($fi)) {
            if ($gzip) { @gzclose($fi); } else { @fclose($fi); }
        }
        if (is_resource($fo)) {
            @fclose($fo);
        }
        if ($temp !== '') {
            @unlink($temp);
        }
        throw $e;
    }
}

$input = $argv[1] ?? '';
$output = $argv[2] ?? '';
$baseArg = array_key_exists(3, $argv) && $argv[3] !== ''
    ? (string)$argv[3] : APE_CABLEAR_DEFAULT_BASE;
$device = array_key_exists(4, $argv) && $argv[4] !== ''
    ? (string)$argv[4] : APE_CABLEAR_DEFAULT_DEVICE;

if ($input === '' || $output === '') {
    fwrite(STDERR, "uso: php ape-cablear-lista.php <in.gz|in.m3u8> <out> [base] [device]\n");
    exit(2);
}

try {
    $startedAt = microtime(true);
    $result = ape_cablear_run($input, $output, $baseArg, $device);
    $elapsed = microtime(true) - $startedAt;
    echo "CABLEADO\n";
    echo "  entrada   : $input\n";
    echo "  salida    : $output\n";
    echo "  tipo lista: {$result['tipo_lista']}\n";
    echo "  bytes     : {$result['bytes_salida']}\n";
    echo "  lineas    : {$result['lineas']}\n";
    echo "  canales   : {$result['canales']}\n";
    echo "  envueltos : {$result['envueltos']}\n";
    echo "  ya estaban: {$result['ya_estaban']}\n";
    echo "  sin id    : {$result['sin_id']}\n";
    echo "  derivados : {$result['correlacion_derivada']}\n";
    echo "  passthrough: {$result['passthrough']}\n";
    echo "  base      : " . rtrim($baseArg, '/') . "\n";
    printf("  tiempo    : %.1f s\n", $elapsed);
    echo "  sha256 in : {$result['sha256_entrada']}\n";
    echo "  sha256 out: {$result['sha256_salida']}\n";
    echo "  sha256    : {$result['sha256_salida']}\n";
    echo 'APE_CABLEAR_RESULT=' . json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR cableando: ' . $e->getMessage() . "\n");
    exit(2);
}
