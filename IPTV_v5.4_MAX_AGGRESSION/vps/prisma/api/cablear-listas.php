<?php
/**
 * cablear-listas.php — listado seguro de fuentes y variantes de /lists/.
 *
 * Descubre cualquier nombre seguro .m3u/.m3u8; no presupone prefijos de
 * catálogo. *_CABLEADA y *_SHIELDED son variantes y no se ofrecen como fuente.
 * Un .gz acompaña solo a un plain stub (<1024 B), nunca a un plain normal.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/list_cablear_core.php';

function ape_listas_emitir($http, array $body)
{
    http_response_code($http);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$__key = getenv('APE_CABLEAR_KEY');
if ($__key === false || $__key === '') {
    $__kf = '/etc/ape/cablear.key';
    if (is_file($__kf) && is_readable($__kf)) {
        $__v = trim((string) @file_get_contents($__kf));
        if ($__v !== '') { $__key = $__v; }
    }
}
if (is_string($__key) && $__key !== '') {
    $__got = isset($_SERVER['HTTP_X_APE_KEY']) ? (string) $_SERVER['HTTP_X_APE_KEY'] : '';
    if ($__got === '' || !hash_equals($__key, $__got)) {
        ape_listas_emitir(401, array('ok' => false, 'error' => 'E_NO_AUTORIZADO', 'motivo' => 'falta X-APE-Key valida'));
    }
}

$__metodo = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
if ($__metodo !== 'GET' && $__metodo !== 'HEAD') {
    header('Allow: GET');
    ape_listas_emitir(405, array('ok' => false, 'error' => 'E_METODO_NO_PERMITIDO', 'motivo' => 'este endpoint solo acepta GET'));
}

$listsRoot = getenv('APE_CABLEAR_LISTS_ROOT') ?: '/var/www/html/lists';
list($__baseOk, $baseUrl, $__baseError) = ape_cablear_public_base_info();
if (!$__baseOk || $baseUrl === null) {
    ape_listas_emitir(500, array('ok' => false, 'error' => $__baseError ?: 'E_BASE_PUBLICA_INVALIDA', 'motivo' => 'la base publica no cumple el contrato HTTP(S)'));
}
$shaMaxBytes = 64 * 1048576;
$headBytes = 65536;

$raiz = realpath($listsRoot);
if ($raiz === false || !is_dir($raiz)) {
    ape_listas_emitir(500, array('ok' => false, 'error' => 'E_DIRECTORIO_NO_LEGIBLE', 'motivo' => 'no puedo resolver el directorio de listas'));
}
$raizPrefix = rtrim($raiz, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;

$limite = 200;
if (isset($_GET['limite'])) {
    $l = (int) $_GET['limite'];
    if ($l >= 1 && $l <= 500) { $limite = $l; }
}

function ape_listas_confined($path, $raiz, $raizPrefix)
{
    $real = realpath($path);
    if ($real === false) { return null; }
    return ($real === rtrim($raiz, DIRECTORY_SEPARATOR) || strpos($real, $raizPrefix) === 0) ? $real : null;
}

function ape_listas_stat_regular($path, $raiz, $raizPrefix)
{
    $ls = @lstat($path);
    if (!is_array($ls) || (($ls['mode'] & 0170000) !== 0100000)) { return null; }
    $real = ape_listas_confined($path, $raiz, $raizPrefix);
    if ($real === null || !is_readable($real)) { return null; }
    $st = @stat($real);
    if (!is_array($st)) { return null; }
    return array(
        'path' => $real,
        'bytes' => isset($st['size']) ? (int) $st['size'] : null,
        'mtime_epoch' => isset($st['mtime']) ? (int) $st['mtime'] : null,
        'ctime_epoch' => isset($st['ctime']) ? (int) $st['ctime'] : null,
        'inode' => isset($st['ino']) ? (int) $st['ino'] : null,
        'dev' => isset($st['dev']) ? (int) $st['dev'] : null,
    );
}

function ape_listas_gz_stat($path, $raiz, $raizPrefix)
{
    $ls = @lstat($path);
    if (!is_array($ls) || (($ls['mode'] & 0170000) !== 0100000)) { return null; }
    $st = ape_listas_stat_regular($path, $raiz, $raizPrefix);
    if ($st === null || (int) $st['bytes'] < 18) { return null; }
    $fh = @fopen($st['path'], 'rb');
    $head = $fh ? @fread($fh, 3) : false;
    if ($fh) { @fclose($fh); }
    if (!is_string($head) || strlen($head) !== 3 || $head !== "\x1f\x8b\x08") { return null; }
    $st['isize_estimate'] = ape_listas_isize($st['path'], (int) $st['bytes']);
    if ($st['isize_estimate'] === null) { return null; }
    $st['isize_exact'] = false;
    $st['integrity_validated'] = false;
    return $st;
}

/** Primeros N bytes descomprimidos, sin descomprimir la lista completa. */
function ape_listas_head($gzPath, $plainPath, $n)
{
    if ($gzPath !== null && function_exists('gzopen')) {
        $h = @gzopen($gzPath, 'rb');
        if ($h !== false) {
            $buf = @gzread($h, $n);
            @gzclose($h);
            if (is_string($buf)) { return $buf; }
        }
        return null;
    }
    $h = @fopen($plainPath, 'rb');
    if ($h === false) { return null; }
    $buf = @fread($h, $n);
    @fclose($h);
    return is_string($buf) ? $buf : null;
}

/** ISIZE del ultimo miembro: pista modulo 2^32, no prueba multi-member/CRC. */
function ape_listas_isize($gzPath, $gzBytes)
{
    if ($gzPath === null || !is_int($gzBytes) || $gzBytes < 18) { return null; }
    $h = @fopen($gzPath, 'rb');
    if ($h === false) { return null; }
    $ok = @fseek($h, -4, SEEK_END);
    $b = $ok === 0 ? @fread($h, 4) : false;
    @fclose($h);
    if (!is_string($b) || strlen($b) !== 4) { return null; }
    $u = unpack('V', $b);
    return is_array($u) && isset($u[1]) ? (int) $u[1] : null;
}

function ape_listas_variante($dir, $nombre, $raiz, $raizPrefix, $baseUrl)
{
    $path = $dir . DIRECTORY_SEPARATOR . $nombre;
    $st = ape_listas_stat_regular($path, $raiz, $raizPrefix);
    if ($st === null) {
        return array('nombre' => $nombre, 'existe' => false, 'bytes' => null, 'mtime' => null, 'url' => null);
    }
    return array(
        'nombre' => $nombre, 'existe' => true, 'bytes' => $st['bytes'],
        'mtime' => $st['mtime_epoch'] !== null ? gmdate('c', $st['mtime_epoch']) : null,
        'url' => $baseUrl . '/lists/' . $nombre,
    );
}

$entradas = array();
$nombres = @scandir($raiz);
if (!is_array($nombres)) {
    ape_listas_emitir(500, array('ok' => false, 'error' => 'E_DIRECTORIO_NO_LEGIBLE', 'motivo' => 'no puedo listar el directorio'));
}

foreach ($nombres as $n) {
    if ($n === '.' || $n === '..') { continue; }
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.[mM]3[uU]8?$/', $n)) { continue; }
    if (preg_match('/_(?:CABLEADA|SHIELDED)\.m3u8?$/i', $n)) { continue; }

    $f = $raiz . DIRECTORY_SEPARATOR . $n;
    $plain = ape_listas_stat_regular($f, $raiz, $raizPrefix);
    if ($plain === null) { continue; }

    $usingGz = false;
    $gzReal = null;
    $gz = null;
    /* Solo el marcador bare #EXTM3U puede promover su sidecar gzip. Un plain
     * HLS corto con contenido manda y su sidecar divergente se ignora. */
    if (ape_cablear_is_explicit_gzip_stub($f)) {
        $gzPath = $f . '.gz';
        if (file_exists($gzPath) || is_link($gzPath)) {
            $gz = ape_listas_gz_stat($gzPath, $raiz, $raizPrefix);
            if ($gz === null) { continue; }
            $gzReal = $gz['path'];
            $usingGz = true;
        }
    }

    $effective = $usingGz ? $gz : $plain;
    $effectivePath = $effective['path'];
    $effectiveBytes = (int) $effective['bytes'];
    $expanded = $usingGz ? (int) $gz['isize_estimate'] : (int) $plain['bytes'];
    $head = ape_listas_head($gzReal, $plain['path'], $headBytes);
    $canales = null;
    $canalesMotivo = 'header-ausente';
    if ($head === null) {
        $canalesMotivo = 'cabecera-no-leible';
    } elseif (preg_match('/^#EXT-X-APE-CHANNELS:\s*(\d+)\s*$/m', $head, $m)) {
        $canales = (int) $m[1];
        $canalesMotivo = null;
    }

    $base = preg_replace('/\.m3u8?$/i', '', $n);
    $cabNombre = $base . '_CABLEADA.m3u8';
    $cab = ape_listas_variante($raiz, $cabNombre, $raiz, $raizPrefix, $baseUrl);
    $shieldNombre = $base . '_SHIELDED.m3u8';
    $shield = ape_listas_variante($raiz, $shieldNombre, $raiz, $raizPrefix, $baseUrl);
    if (!$shield['existe']) {
        $shieldM3u = $base . '_SHIELDED.m3u';
        $shieldAlt = ape_listas_variante($raiz, $shieldM3u, $raiz, $raizPrefix, $baseUrl);
        if ($shieldAlt['existe']) { $shield = $shieldAlt; }
    }
    $tieneCab = $cab['existe'];
    $cabMtimeEpoch = $tieneCab ? @filemtime($raiz . DIRECTORY_SEPARATOR . $cabNombre) : null;
    $cabMtimeEpoch = is_int($cabMtimeEpoch) ? $cabMtimeEpoch : null;
    $cabBytes = $tieneCab ? $cab['bytes'] : null;
    $cabMasNueva = ($tieneCab && $cabMtimeEpoch !== null && $effective['mtime_epoch'] !== null)
        ? ($cabMtimeEpoch > (int) $effective['mtime_epoch']) : null;
    $estado = !$tieneCab ? 'sin_cablear' : ($cabMasNueva === true ? 'al_dia' : 'desactualizada');

    $sha = null;
    $shaMotivo = null;
    if ($usingGz) {
        $shaMotivo = 'stub-gzip-no-se-afirma-hash-del-contenido-expandido';
    } elseif ($plain['bytes'] === null) {
        $shaMotivo = 'tamano-no-leible';
    } elseif ($plain['bytes'] > $shaMaxBytes) {
        $shaMotivo = 'demasiado-grande-para-calcularlo-en-una-lista';
    } else {
        $h = @hash_file('sha256', $plain['path']);
        if (is_string($h) && $h !== '') { $sha = $h; } else { $shaMotivo = 'hash-fallido'; }
    }

    $identity = array(
        'source_kind' => $usingGz ? 'gzip_stub' : 'plain',
        'path' => $n, 'bytes' => (int) $plain['bytes'],
        'mtime_epoch' => (int) $plain['mtime_epoch'], 'ctime_epoch' => (int) $plain['ctime_epoch'],
        'inode' => (int) $plain['inode'], 'dev' => (int) $plain['dev'],
        'gz' => $usingGz ? array(
            'path' => $n . '.gz', 'bytes' => (int) $gz['bytes'],
            'mtime_epoch' => (int) $gz['mtime_epoch'], 'ctime_epoch' => (int) $gz['ctime_epoch'],
            'inode' => (int) $gz['inode'], 'dev' => (int) $gz['dev'],
            'isize_estimate' => (int) $gz['isize_estimate'], 'isize_exact' => false,
            'integrity_validated' => false,
        ) : null,
        'effective_path' => $usingGz ? $n . '.gz' : $n,
        'effective_bytes' => $effectiveBytes,
        'effective_mtime_epoch' => (int) $effective['mtime_epoch'],
        'effective_ctime_epoch' => (int) $effective['ctime_epoch'],
        'effective_inode' => (int) $effective['inode'], 'effective_dev' => (int) $effective['dev'],
        'expanded_bytes_estimate' => $expanded,
        'expanded_bytes_is_estimate' => $usingGz,
    );

    $entradas[] = array(
        'nombre' => $n, 'bytes' => $plain['bytes'],
        'bytes_gz' => $usingGz ? (int) $gz['bytes'] : null,
        'bytes_descomprimidos' => $expanded,
        'bytes_descomprimidos_estimacion' => $usingGz,
        'bytes_descomprimidos_motivo' => $usingGz ? 'gzip_trailer_isize_estimacion_sin_prueba_integridad' : 'plain_bytes',
        'fuente_efectiva' => $usingGz ? 'gzip_stub' : 'plain',
        'fuente_efectiva_nombre' => $usingGz ? $n . '.gz' : $n,
        'mtime' => $effective['mtime_epoch'] !== null ? gmdate('c', $effective['mtime_epoch']) : null,
        'mtime_epoch' => $effective['mtime_epoch'],
        'canales' => $canales, 'canales_motivo' => $canalesMotivo,
        'sha256' => $sha, 'sha256_motivo' => $shaMotivo,
        'url' => $baseUrl . '/lists/' . $n,
        'tiene_cableada' => $tieneCab, 'url_cableada' => $tieneCab ? $cab['url'] : null,
        'cableada_bytes' => $cabBytes,
        'cableada_mtime' => $cabMtimeEpoch !== null ? gmdate('c', $cabMtimeEpoch) : null,
        'cableada_mas_nueva' => $cabMasNueva, 'estado' => $estado,
        'variantes' => array('cableada' => $cab, 'shielded' => $shield),
    );
}

usort($entradas, function ($a, $b) {
    $am = $a['mtime_epoch']; $bm = $b['mtime_epoch'];
    if ($am === null && $bm === null) { return strcmp($a['nombre'], $b['nombre']); }
    if ($am === null) { return 1; }
    if ($bm === null) { return -1; }
    if ($am === $bm) { return strcmp($a['nombre'], $b['nombre']); }
    return ($am > $bm) ? -1 : 1;
});
$total = count($entradas);
if ($total > $limite) { $entradas = array_slice($entradas, 0, $limite); }

ape_listas_emitir(200, array(
    'ok' => true, 'count' => count($entradas), 'total' => $total,
    'truncado' => ($total > $limite), 'generado' => gmdate('c'), 'base' => $baseUrl,
    'listas' => $entradas, 'auth' => (is_string($__key) && $__key !== '') ? 'x-ape-key' : 'heredada',
));
