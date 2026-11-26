#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Regresión local del motor APE. Todas las entradas son fixtures técnicos
 * efímeros; no usa listas privadas, VPS ni red de proveedores.
 */

const ENGINE = __DIR__ . '/../ops/ape-cablear-lista.php';

$root = sys_get_temp_dir() . '/ape-cablear-engine-' . getmypid() . '-' . bin2hex(random_bytes(4));
if (!@mkdir($root, 0700, true)) {
    fwrite(STDERR, "No se pudo crear el directorio temporal\n");
    exit(1);
}

$fails = 0;
$passes = 0;

function t(string $name, bool $condition, string $detail = ''): void
{
    global $fails, $passes;
    if ($condition) {
        $passes++;
        echo "PASS  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n";
    } else {
        $fails++;
        echo "FAIL  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n";
    }
}

function write_bytes(string $path, string $bytes): void
{
    if (@file_put_contents($path, $bytes) !== strlen($bytes)) {
        throw new RuntimeException("no se pudo escribir fixture");
    }
}

function run_engine(string $input, string $output, ?string $base = 'https://edge.test', ?string $device = 'test-device'): array
{
    $args = [PHP_BINARY, ENGINE, $input, $output];
    if ($base !== null) {
        $args[] = $base;
        if ($device !== null) {
            $args[] = $device;
        }
    }
    $command = implode(' ', array_map('escapeshellarg', $args));
    $spec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open($command, $spec, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('no se pudo iniciar PHP');
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($proc);
    $receipt = null;
    if (preg_match('/^APE_CABLEAR_RESULT=(\{.*\})$/m', $stdout, $m)) {
        $receipt = json_decode($m[1], true);
    }
    return ['status' => $status, 'stdout' => $stdout, 'stderr' => $stderr, 'receipt' => $receipt];
}

function sha256_file_or_empty(string $path): string
{
    $hash = @hash_file('sha256', $path);
    return is_string($hash) ? $hash : '';
}

function assert_receipt_shape(?array $r): bool
{
    if (!is_array($r)) {
        return false;
    }
    $fields = [
        'tipo_lista', 'bytes_entrada', 'bytes_salida', 'sha256_entrada', 'sha256_salida',
        'sha256_metadata_entrada', 'sha256_metadata_salida', 'lineas', 'canales',
        'envueltos', 'ya_estaban', 'sin_id', 'correlacion_derivada', 'passthrough',
    ];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $r)) {
            return false;
        }
    }
    return true;
}

try {
    $base = 'https://edge.test';
    $longMetadata = '#EXTHTTP:Cache-Control=' . str_repeat('M', 1024 * 1024 + 123) . "\r\n";
    $providerSource = 'https://origin.test/live/user/pass/42.m3u8?token=a+b&path=%2Ffoo';
    $pipedSource = 'https://origin.test/piped.m3u8?query=a+b&path=%2Fparts|User-Agent=Pipe/1.0|Referer=https://ref.test/piped';
    $headerSource = 'https://origin.test/headers.m3u8';
    $catalog = "\xEF\xBB\xBF#EXTM3U\r\n"
        . "#EXTVLCOPT:http-referrer=https://ref.test/uno\r\n"
        . $longMetadata
        . "#EXTINF:0 tvg-id=\"987\" tvg-name=\"Canál UTF-8\" group-title=\"Pruebas\",Canál\r\n"
        . $providerSource . "\r\n"
        . "#KODIPROP:inputstream.adaptive.manifest_type=m3u8\n"
        . "#EXTINF:12,Catálogo positivo\r\n"
        . "https://origin.test/positive/77.m3u8?x=1\r\n"
        . "#EXTINF:-1 tvg-name=\"Sin ID\",Arbitrary\n"
        . "https://origin.test/channel.m3u8?next=/pulse/7\n"
        . "#EXTINF:-1,Root\r\n"
        . "https://edge.test/catalog/123.m3u8\r\n"
        . "#EXTINF:-1,Already\r\n"
        . "https://edge.test/pulse/88.m3u8?u=https%3A%2F%2Forigin.test%2F88.m3u8&d=test-device&id=88\r\n"
        . "#EXTINF:-1,Pipe headers\r\n"
        . $pipedSource . "\r\n"
        . "#EXTINF:-1,Metadata headers\r\n"
        . "#EXTVLCOPT:http-referrer=https://ref.test/channel\r\n"
        . '#EXTHTTP:{"User-Agent":"ChannelAgent/1.0"}' . "\r\n"
        . $headerSource . "\r\n"
        . "#EXTINF:-1,Invalid\n"
        . "https://origin.test/invalid.m3u8?bad=has space\n";
    $catalogPath = $root . '/catalog.m3u8';
    $catalogOut = $root . '/catalog.out.m3u8';
    write_bytes($catalogPath, $catalog);
    $sourceHashBefore = sha256_file_or_empty($catalogPath);

    $r = run_engine($catalogPath, $catalogOut, $base, 'test-device');
    t('catálogo técnico ejecuta', $r['status'] === 0, trim($r['stderr']));
    t('receipt JSON único y completo', assert_receipt_shape($r['receipt']));
    $cr = is_array($r['receipt']) ? $r['receipt'] : [];
    t('clasificación catálogo M3U8', ($cr['tipo_lista'] ?? '') === 'catalog_m3u8');
    t('línea >1 MiB no se trunca', strpos((string)@file_get_contents($catalogOut), $longMetadata) !== false);
    t('BOM y CRLF iniciales verbatim', str_starts_with((string)@file_get_contents($catalogOut), "\xEF\xBB\xBF#EXTM3U\r\n"));
    t('source immutable', sha256_file_or_empty($catalogPath) === $sourceHashBefore);
    t('bytes/hash entrada del receipt', ($cr['bytes_entrada'] ?? -1) === strlen($catalog)
        && ($cr['sha256_entrada'] ?? '') === hash('sha256', $catalog));
    t('bytes/hash salida del receipt', ($cr['bytes_salida'] ?? -1) === filesize($catalogOut)
        && ($cr['sha256_salida'] ?? '') === sha256_file_or_empty($catalogOut));
    t('hash metadata entrada/salida coincide', ($cr['sha256_metadata_entrada'] ?? '') !== ''
        && ($cr['sha256_metadata_entrada'] ?? '') === ($cr['sha256_metadata_salida'] ?? ''));
    $catalogText = (string)@file_get_contents($catalogOut);
    $providerLine = '';
    foreach (preg_split('/\r\n|\n|\r/', $catalogText) as $candidate) {
        if (str_contains($candidate, '/pulse/987.m3u8?u=')) {
            $providerLine = $candidate;
            break;
        }
    }
    $providerQuery = [];
    if ($providerLine !== '') {
        parse_str((string)parse_url($providerLine, PHP_URL_QUERY), $providerQuery);
    }
    t('canales = envueltos + ya_estaban + sin_id', ($cr['canales'] ?? -1) === 8
        && ($cr['envueltos'] ?? -1) + ($cr['ya_estaban'] ?? -1) + ($cr['sin_id'] ?? -1) === ($cr['canales'] ?? -2));
    t('EXTINF 0 y positivo son catálogo envuelto', strpos($catalogText, '/pulse/987.m3u8?u=') !== false
        && strpos($catalogText, '/pulse/77.m3u8?u=') !== false);
    t('providerID y u decodifican query exacta sin pipes', ($providerQuery['u'] ?? '') === $providerSource
        && strpos($catalogText, "&id=987\r\n") !== false);
    t('pipe con dos headers queda URI directa y omitida', strpos($catalogText, $pipedSource . "\r\n") !== false
        && strpos($catalogText, '/pulse/77.m3u8?u=') !== false
        && ($cr['sin_id'] ?? -1) === 3);
    t('EXTHTTP/EXTVLCOPT del canal quedan directos y omitidos', strpos($catalogText, $headerSource . "\r\n") !== false
        && strpos($catalogText, "#EXTVLCOPT:http-referrer=https://ref.test/channel\r\n") !== false
        && strpos($catalogText, "#EXTHTTP:{\"User-Agent\":\"ChannelAgent/1.0\"}\r\n") !== false);
    t('URL inválida según pulse queda original', strpos((string)@file_get_contents($catalogOut), "https://origin.test/invalid.m3u8?bad=has space\n") !== false
        && ($cr['sin_id'] ?? -1) === 3);
    t('correlación derivada explícita', ($cr['correlacion_derivada'] ?? -1) === 1
        && preg_match('#/pulse/[0-9]+\.m3u8\?u=#', (string)@file_get_contents($catalogOut)) === 1);

    $catalogOut2 = $root . '/catalog.idempotent.m3u8';
    $r2 = run_engine($catalogOut, $catalogOut2, $base, 'test-device');
    t('segunda pasada ejecuta', $r2['status'] === 0, trim($r2['stderr']));
    $cr2 = is_array($r2['receipt']) ? $r2['receipt'] : [];
    t('idempotencia sin doble envoltura', ($cr2['envueltos'] ?? -1) === 0
        && ($cr2['ya_estaban'] ?? -1) === 5
        && ($cr2['sin_id'] ?? -1) === 3
        && @file_get_contents($catalogOut2) === @file_get_contents($catalogOut));

    /* Una URL propia puede superar 2000 caracteres por el u= codificado o
     * llevar headers dentro de u=. Sigue siendo ALREADY: no es fuente nueva,
     * no se reenvuelve y no debe contarse como sin_id. */
    $longSource = 'https://origin.test/live/long/index.m3u8?token=' . str_repeat('A', 2100);
    $longWrapped = $base . '/pulse/123456789.m3u8?u=' . rawurlencode($longSource) . '&d=test-device';
    $longBody = "#EXTM3U\n#EXTINF:-1,Canal ya cableado largo\n" . $longWrapped . "\n";
    $longPath = $root . '/already-long.m3u8';
    $longOut = $root . '/already-long.out.m3u8';
    write_bytes($longPath, $longBody);
    $rl = run_engine($longPath, $longOut, $base, 'test-device');
    $lr = is_array($rl['receipt']) ? $rl['receipt'] : [];
    t('URL propia >2000 caracteres se reconoce ALREADY', $rl['status'] === 0
        && strlen($longWrapped) > 2000
        && ($lr['canales'] ?? -1) === 1 && ($lr['envueltos'] ?? -1) === 0
        && ($lr['ya_estaban'] ?? -1) === 1 && ($lr['sin_id'] ?? -1) === 0,
        'bytes=' . strlen($longWrapped));
    t('URL propia larga se conserva verbatim', @file_get_contents($longOut) === $longBody);

    $pipedWrappedSource = 'https://origin.test/live/piped.m3u8|User-Agent=PlayerX&Referer=https://ref.test/';
    $pipedWrapped = $base . '/pulse/55.m3u8?u=' . rawurlencode($pipedWrappedSource) . '&d=test-device';
    $pipedBody = "#EXTM3U\n#EXTINF:-1,Canal ya cableado con headers en u\n" . $pipedWrapped . "\n";
    $pipedPath = $root . '/already-piped.m3u8';
    $pipedOut = $root . '/already-piped.out.m3u8';
    write_bytes($pipedPath, $pipedBody);
    $rp = run_engine($pipedPath, $pipedOut, $base, 'test-device');
    $pr = is_array($rp['receipt']) ? $rp['receipt'] : [];
    t('URL propia con headers en u se reconoce ALREADY', $rp['status'] === 0
        && ($pr['envueltos'] ?? -1) === 0 && ($pr['ya_estaban'] ?? -1) === 1
        && ($pr['sin_id'] ?? -1) === 0);
    t('URL propia con headers en u se conserva verbatim', @file_get_contents($pipedOut) === $pipedBody);

    $simple = $root . '/simple.url';
    $simpleOut = $root . '/simple.out';
    write_bytes($simple, 'https://origin.test/simple.m3u8');
    $rs = run_engine($simple, $simpleOut, $base, 'test-device');
    $sr = is_array($rs['receipt']) ? $rs['receipt'] : [];
    t('simple URL clasificada y envuelta', $rs['status'] === 0 && ($sr['tipo_lista'] ?? '') === 'simple_url'
        && ($sr['canales'] ?? -1) === 1 && ($sr['envueltos'] ?? -1) === 1
        && ($sr['sin_id'] ?? -1) === 0 && ($sr['correlacion_derivada'] ?? -1) === 1
        && !str_ends_with((string)@file_get_contents($simpleOut), "\n"));

    $hybrid = $root . '/hybrid.m3u8';
    $hybridOut = $root . '/hybrid.out.m3u8';
    $hybridBody = "#EXTM3U\r\n#EXT-X-TARGETDURATION:6\r\n#EXTINF:-1 tvg-id=\"17\",Híbrido\r\nhttps://origin.test/live/a/b/17.m3u8\r\n";
    write_bytes($hybrid, $hybridBody);
    $rh = run_engine($hybrid, $hybridOut, $base, 'test-device');
    $hr = is_array($rh['receipt']) ? $rh['receipt'] : [];
    t('híbrido APE no se confunde con media HLS', $rh['status'] === 0
        && ($hr['tipo_lista'] ?? '') === 'catalog_m3u8'
        && ($hr['envueltos'] ?? -1) === 1
        && strpos((string)@file_get_contents($hybridOut), '/pulse/17.m3u8?u=') !== false);

    $hls = $root . '/media.m3u8';
    $hlsOut = $root . '/media.out.m3u8';
    $hlsBody = "\xEF\xBB\xBF#EXTM3U\r\n"
        . "#EXT-X-VERSION:9\r\n"
        . "#EXT-X-TARGETDURATION:6\r\n"
        . "#EXT-X-MEDIA-SEQUENCE:42\r\n"
        . "#EXT-X-MAP:URI=\"init.mp4\"\r\n"
        . "#EXT-X-KEY:METHOD=AES-128,URI=\"keys/key.bin\"\r\n"
        . "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5\r\n"
        . "#EXT-X-PART-INF:PART-TARGET=1.000\r\n"
        . "#EXT-X-PART:DURATION=1.000,URI=\"parts/seg6.1.m4s\"\r\n"
        . "#EXT-X-PRELOAD-HINT:TYPE=PART,URI=\"parts/seg6.2.m4s\"\r\n"
        . "#EXTINF:2.000,channel-id=free group-title=\"HLS title\",Título libre\r\n"
        . "https://segments.test/seg2.ts\r\n"
        . "#EXTINF:4.000,\r\nseg4.ts\r\n"
        . "#EXTINF:6.000,\r\nhttps://segments.test/seg6.ts\r\n"
        . "#EXT-X-ENDLIST\r\n";
    write_bytes($hls, $hlsBody);
    $rm = run_engine($hls, $hlsOut, $base, 'test-device');
    $mr = is_array($rm['receipt']) ? $rm['receipt'] : [];
    t('HLS media genuino clasificado', $rm['status'] === 0 && ($mr['tipo_lista'] ?? '') === 'hls_media');
    t('HLS media LL/segmentos exacto', @file_get_contents($hlsOut) === $hlsBody
        && ($mr['envueltos'] ?? -1) === 0 && ($mr['canales'] ?? -1) === 0
        && ($mr['passthrough'] ?? -1) === 3
        && ($mr['sha256_entrada'] ?? '') === ($mr['sha256_salida'] ?? ''));
    t('HLS metadata hash exacto', ($mr['sha256_metadata_entrada'] ?? '') === ($mr['sha256_metadata_salida'] ?? ''));

    $master = $root . '/master.m3u8';
    $masterOut = $root . '/master.out.m3u8';
    $masterBody = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=3840x2160,CODECS=\"hvc1.2.4.L153.B0\"\nvariant-4k.m3u8\n";
    write_bytes($master, $masterBody);
    $rmaster = run_engine($master, $masterOut, $base, 'test-device');
    $mr2 = is_array($rmaster['receipt']) ? $rmaster['receipt'] : [];
    t('HLS master genuino passthrough', $rmaster['status'] === 0
        && ($mr2['tipo_lista'] ?? '') === 'hls_master'
        && @file_get_contents($masterOut) === $masterBody
        && ($mr2['envueltos'] ?? -1) === 0 && ($mr2['passthrough'] ?? -1) === 1);

    $gzip = $root . '/catalog.m3u8.gz';
    $gzipOut = $root . '/gzip.out.m3u8';
    write_bytes($gzip, gzencode($catalog, 9, FORCE_GZIP));
    $rg = run_engine($gzip, $gzipOut, $base, 'test-device');
    $gr = is_array($rg['receipt']) ? $rg['receipt'] : [];
    t('gzip válido conserva hash descomprimido', $rg['status'] === 0
        && ($gr['sha256_entrada'] ?? '') === hash('sha256', $catalog));

    $corrupt = $root . '/corrupt.m3u8.gz';
    $gzipBytes = (string)@file_get_contents($gzip);
    $gzipBytes[strlen($gzipBytes) - 1] = chr(ord($gzipBytes[strlen($gzipBytes) - 1]) ^ 0xFF);
    write_bytes($corrupt, $gzipBytes);
    $corruptOut = $root . '/corrupt.out.m3u8';
    $bad = run_engine($corrupt, $corruptOut, $base, 'test-device');
    t('gzip corrupto falla sin éxito ni salida', $bad['status'] !== 0
        && !file_exists($corruptOut) && !str_contains($bad['stdout'], 'APE_CABLEAR_RESULT='));

    $aliasTarget = $root . '/alias-target.txt';
    $aliasSymlink = $root . '/alias-symlink.m3u8';
    write_bytes($aliasTarget, 'KEEP');
    symlink($aliasTarget, $aliasSymlink);
    $alias = run_engine($simple, $aliasSymlink, $base, 'test-device');
    t('salida symlink rechazada e intacta', $alias['status'] !== 0 && @file_get_contents($aliasTarget) === 'KEEP');

    $hardlink = $root . '/alias-hardlink.m3u8';
    link($catalogPath, $hardlink);
    $hard = run_engine($catalogPath, $hardlink, $base, 'test-device');
    t('salida hardlink al source rechazada', $hard['status'] !== 0 && sha256_file_or_empty($catalogPath) === $sourceHashBefore);

    foreach (['https://user:pass@edge.test', 'https://edge.test?x=1', 'https://edge.test/path#fragment'] as $invalidBase) {
        $badBaseOut = $root . '/bad-base-' . md5($invalidBase) . '.m3u8';
        $rb = run_engine($simple, $badBaseOut, $invalidBase, 'test-device');
        t('base inválida rechazada: ' . $invalidBase, $rb['status'] !== 0 && !file_exists($badBaseOut));
    }

    /* Strings pedidos por el propietario: conservar, NO simular un bitstream.
     * Crystal permanece DECLARED; esta fixture no acredita aplicación en un SoC. */
    foreach ([186, 183, 180, 156, 153, 150, 123] as $levelIdc) {
        $codec = 'hvc1.2.4.L' . $levelIdc . '.B0';
        $metadata = "#EXTM3U\r\n#EXT-X-APE-CODEC-PREFERRED:$codec\r\n"
            . "#EXT-X-APE-ENHANCE-STATE:DECLARED\r\n"
            . "#EXT-X-APE-REA:{\"crystal_uhd\":true,\"executed\":false}\r\n"
            . "#EXTINF:-1,HEVC técnico\r\n";
        $codecInput = $root . '/codec-' . $levelIdc . '.m3u8';
        $codecOutput = $root . '/codec-' . $levelIdc . '.out.m3u8';
        write_bytes($codecInput, $metadata . "https://origin.test/$levelIdc.m3u8\r\n");
        $codecRun = run_engine($codecInput, $codecOutput, $base, 'test-device');
        $codecReceipt = $codecRun['receipt'] ?? [];
        t('HEVC/Crystal solicitados preservados: ' . $codec, $codecRun['status'] === 0
            && str_starts_with((string)file_get_contents($codecOutput), $metadata)
            && ($codecReceipt['sha256_metadata_entrada'] ?? '') === ($codecReceipt['sha256_metadata_salida'] ?? '-'));
    }

    echo "\n" . ($fails === 0 ? 'OK' : 'FALLOS: ' . $fails) . " — PASS: $passes\n";
    exit($fails === 0 ? 0 : 1);
} catch (Throwable $e) {
    fwrite(STDERR, "ERROR en suite: " . $e->getMessage() . "\n");
    exit(1);
} finally {
    if (is_dir($root)) {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            if ($item->isDir() && !$item->isLink()) {
                @rmdir($item->getPathname());
            } else {
                @unlink($item->getPathname());
            }
        }
        @rmdir($root);
    }
}
