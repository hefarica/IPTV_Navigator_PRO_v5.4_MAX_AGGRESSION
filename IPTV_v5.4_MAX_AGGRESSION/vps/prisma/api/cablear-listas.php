<?php
/**
 * cablear-listas.php — LISTADO de las listas disponibles en /lists/ (t64).
 *
 *   GET /prisma/api/cablear-listas.php            -> JSON con las listas del directorio
 *   GET /prisma/api/cablear-listas.php?limite=50  -> tope de entradas (1..500, por defecto 200)
 *
 * PARA QUE: el panel (t65) necesita OFRECER listas para elegir. Sin este endpoint
 * solo puede pedir un nombre a ciegas, y el pedido del operador es "cablear una
 * lista que no sea la ultima".
 *
 * QUE DEVUELVE por lista (nunca rutas absolutas del sistema, solo el nombre):
 *   nombre · bytes · bytes_gz · bytes_descomprimidos · mtime · mtime_epoch
 *   canales · canales_motivo · sha256 (solo si es barato) · url
 *   tiene_cableada · url_cableada · cableada_bytes · cableada_mtime
 *   cableada_mas_nueva · estado ('sin_cablear' | 'al_dia' | 'desactualizada')
 *
 * REGLA DE ORO DEL CONTEO (del encargo, medida): NO se descomprime la lista
 * entera. La lista del operador pesa 1,3 GB y descomprimirla son ~8 s POR lista.
 * El dato viene en el header `#EXT-X-APE-CHANNELS:21224`; se leen los primeros
 * 64 KB descomprimidos y se saca de ahi. Si el header no esta -> canales=null
 * con su motivo, NUNCA un 0 disfrazado.
 *
 * COSTE REAL por lista: stat() + (si hay .gz) abrir el gz y descomprimir 64 KB +
 * leer 4 bytes del trailer. Con 5 listas son milisegundos, no segundos.
 *
 * SEGURIDAD (misma doctrina que t60):
 *   - solo el directorio de listas; se rechaza todo candidato cuyo realpath() no
 *     cuelgue de realpath(raiz)
 *   - D1 MEDIDO por t60: /var/www/html/lists es un SYMLINK a /var/www/lists. Por
 *     eso la barrera compara contra realpath(raiz) y NO contra la letra del path:
 *     comparar contra la letra rechazaria TODA lista valida.
 *   - X-APE-Key si APE_CABLEAR_KEY (o /etc/ape/cablear.key) esta definida
 *   - errores PLANOS {ok:false, error:'E_CODE', motivo:'texto'} como t60
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

function ape_listas_emitir($http, array $body)
{
    http_response_code($http);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── control de acceso: identico al de list-cablear-status.php (t60) ───────── */
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

/* ── raiz de listas: el MISMO nombre de variable que t60 (APE_CABLEAR_LISTS_ROOT) */
$listsRoot = getenv('APE_CABLEAR_LISTS_ROOT') ?: '/var/www/html/lists';
$baseUrl = rtrim((string) (getenv('APE_PUBLIC_BASE') ?: 'https://iptv-ape.duckdns.org'), '/');
$shaMaxBytes = 64 * 1048576;   /* "si es barato": hashear 1,3 GB no lo es */
$headBytes = 65536;            /* ventana del header: 64 KB descomprimidos */

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

/** Primeros N bytes DESCOMPRIMIDOS de la lista: por el .gz si existe (barato), si no del .m3u8. */
function ape_listas_head($gzPath, $plainPath, $n)
{
    if ($gzPath !== null && function_exists('gzopen')) {
        $h = @gzopen($gzPath, 'rb');
        if ($h !== false) {
            $buf = @gzread($h, $n);           /* descomprime SOLO $n bytes */
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

/** Tamano descomprimido con el trailer gzip (ISIZE): 4 bytes, exacto por debajo de 4 GiB. */
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
    return is_array($u) ? (int) $u[1] : null;
}

$entradas = array();
$nombres = @scandir($raiz);
if (!is_array($nombres)) {
    ape_listas_emitir(500, array('ok' => false, 'error' => 'E_DIRECTORIO_NO_LEGIBLE', 'motivo' => 'no puedo listar el directorio'));
}

foreach ($nombres as $n) {
    if ($n === '.' || $n === '..') { continue; }
    if (substr($n, -5) !== '.m3u8') { continue; }
    /* Variantes, no fuentes: *_CABLEADA.m3u8 y *_SHIELDED.m3u8 se excluyen. */
    if (substr($n, -14) === '_CABLEADA.m3u8' || substr($n, -14) === '_SHIELDED.m3u8') { continue; }

    $f = $raiz . DIRECTORY_SEPARATOR . $n;
    if (!is_file($f)) { continue; }
    /* Barrera D1: contra realpath(raiz), no contra la letra del path. */
    $real = realpath($f);
    if ($real === false || strpos($real, $raizPrefix) !== 0) { continue; }
    if (!is_readable($real)) { continue; }

    $bytes = @filesize($real);
    if (!is_int($bytes)) { $bytes = null; }
    $mt = @filemtime($real);
    $mt = is_int($mt) ? $mt : null;

    $gzNombre = $n . '.gz';
    $gzPath = $raiz . DIRECTORY_SEPARATOR . $gzNombre;
    $gzReal = null;
    $gzBytes = null;
    if (is_file($gzPath)) {
        $r = realpath($gzPath);
        if ($r !== false && strpos($r, $raizPrefix) === 0) {
            $gzReal = $r;
            $b = @filesize($r);
            $gzBytes = is_int($b) ? $b : null;
        }
    }

    /* ── canales: del header, leyendo 64 KB. NUNCA descomprimiendo la lista. ── */
    $canales = null;
    $canalesMotivo = 'header-ausente';
    $head = ape_listas_head($gzReal, $real, $headBytes);
    if ($head === null) {
        $canalesMotivo = 'cabecera-no-leible';
    } elseif (preg_match('/^#EXT-X-APE-CHANNELS:\s*(\d+)\s*$/m', $head, $m)) {
        $canales = (int) $m[1];
        $canalesMotivo = null;
    }

    /* ── variante cableada: existe? es mas nueva que la fuente? ─────────────── */
    $base = substr($n, 0, -5);
    $cabNombre = $base . '_CABLEADA.m3u8';
    $cabPath = $raiz . DIRECTORY_SEPARATOR . $cabNombre;
    $tieneCab = false;
    $cabBytes = null;
    $cabMtime = null;
    $cabMasNueva = null;
    if (is_file($cabPath)) {
        $r = realpath($cabPath);
        if ($r !== false && strpos($r, $raizPrefix) === 0) {
            $tieneCab = true;
            $b = @filesize($r);
            $cabBytes = is_int($b) ? $b : null;
            $cm = @filemtime($r);
            $cabMtime = is_int($cm) ? $cm : null;
            if ($cabMtime !== null && $mt !== null) { $cabMasNueva = ($cabMtime > $mt); }
        }
    }

    $estado = 'sin_cablear';
    if ($tieneCab) { $estado = ($cabMasNueva === true) ? 'al_dia' : 'desactualizada'; }

    /* ── sha256 solo si es barato (<=64 MB). Si no, se declara por que no. ──── */
    $sha = null;
    $shaMotivo = null;
    if ($bytes === null) {
        $shaMotivo = 'tamano-no-leible';
    } elseif ($bytes > $shaMaxBytes) {
        $shaMotivo = 'demasiado-grande-para-calcularlo-en-una-lista';
    } else {
        $h = @hash_file('sha256', $real);
        if (is_string($h) && $h !== '') { $sha = $h; } else { $shaMotivo = 'hash-fallido'; }
    }

    $entradas[] = array(
        'nombre' => $n,
        'bytes' => $bytes,
        'bytes_gz' => $gzBytes,
        'bytes_descomprimidos' => ape_listas_isize($gzReal, $gzBytes),
        'mtime' => $mt !== null ? gmdate('c', $mt) : null,
        'mtime_epoch' => $mt,
        'canales' => $canales,
        'canales_motivo' => $canalesMotivo,
        'sha256' => $sha,
        'sha256_motivo' => $shaMotivo,
        'url' => $baseUrl . '/lists/' . $n,
        'tiene_cableada' => $tieneCab,
        'url_cableada' => $tieneCab ? ($baseUrl . '/lists/' . $cabNombre) : null,
        'cableada_bytes' => $cabBytes,
        'cableada_mtime' => $cabMtime !== null ? gmdate('c', $cabMtime) : null,
        'cableada_mas_nueva' => $cabMasNueva,
        'estado' => $estado,
    );
}

/* Orden: mtime descendente. La primera es la mas reciente y el operador ve de un
 * golpe cual es cual. Sin mtime va al final; empate -> nombre ascendente. */
usort($entradas, function ($a, $b) {
    $am = $a['mtime_epoch'];
    $bm = $b['mtime_epoch'];
    if ($am === null && $bm === null) { return strcmp($a['nombre'], $b['nombre']); }
    if ($am === null) { return 1; }
    if ($bm === null) { return -1; }
    if ($am === $bm) { return strcmp($a['nombre'], $b['nombre']); }
    return ($am > $bm) ? -1 : 1;
});

$total = count($entradas);
if ($total > $limite) { $entradas = array_slice($entradas, 0, $limite); }

ape_listas_emitir(200, array(
    'ok' => true,
    'count' => count($entradas),
    'total' => $total,
    'truncado' => ($total > $limite),
    'generado' => gmdate('c'),
    'base' => $baseUrl,
    'listas' => $entradas,
    'auth' => (is_string($__key) && $__key !== '') ? 'x-ape-key' : 'heredada',
));
