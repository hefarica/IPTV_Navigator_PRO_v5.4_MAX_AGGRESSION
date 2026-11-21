<?php
/**
 * list-publish.php — PUBLICACION ATOMICA de una lista en UNA sola llamada.
 *
 * POR QUE EXISTE (2026-11-15)
 *   Antes la publicacion eran pasos sueltos que se ejecutaban en momentos distintos:
 *   generar -> subir (a mano) -> proyectar -> plantillas -> verificar -> enlazar.
 *   Si cualquiera se saltaba o fallaba, la salida era otra lista y nadie se enteraba.
 *   Este endpoint los encadena: o salen TODOS y se verifica el contrato, o responde
 *   ok:false con la razon literal y NO publica nada.
 *
 * LOS SEIS PASOS (el 1 y el 2 son del navegador: generar y subir)
 *   3) proyeccion OTT        /opt/ape-pulse/ape-list-project.sh      -> <base>_CABLEADA_LIGHT.m3u8
 *   4) plantillas + indice   /opt/ape-pulse/ape-profile-project.js   -> /tmp/<base>_PLACEHOLDER.m3u8
 *   5) instalacion           copia a /var/www/lists + chown + chmod
 *   6) verificacion          canales, plantillas=9, ape_cuerpo=0, pulse>0, URLs==canales
 *   7) enlace estable        streamlink.m3u8 -> <base>_PLACEHOLDER.m3u8  (0,00 MB)
 *
 * FAIL-CLOSED EN TODO: sin script, sin lista, con un paso fallando o con el contrato
 * incumplido, la respuesta es un rechazo con la razon y el paso. Nunca "ok" optimista.
 * Si el paso 6 falla, NO se crea ni se mueve el enlace: la lista anterior sigue viva.
 *
 * SOLO POST. No borra, no toca el generador, no sale de /var/www/lists y /tmp.
 */
declare(strict_types=1);

const ALLOWED_DIR      = '/var/www/lists';
const SCRIPT_PROJECT   = '/opt/ape-pulse/ape-list-project.sh';
const SCRIPT_PROJ_JS   = '/opt/ape-pulse/ape-profile-project.js';
const LINK_NAME        = 'streamlink.m3u8';
const STEP_TIMEOUT     = 300;   // s por paso (la proyeccion medida tarda 86-90 s)
const TAG              = 'list-publish/1.0.0';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-APE-Endpoint: ' . TAG);
// CORS: el panel corre en 127.0.0.1:5500 y llama a este host.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function out(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Ejecuta un comando y devuelve [exit, salida]. Nunca lanza. */
function run(string $cmd): array
{
    $out = [];
    $rc  = 0;
    @exec($cmd, $out, $rc);
    return [$rc, implode("\n", array_slice($out, 0, 40))];
}

/** Cuenta ocurrencias de un prefijo de linea en un fichero, en streaming. */
function countLines(string $path, string $regex): int
{
    $fh = @fopen($path, 'rb');
    if ($fh === false) { return -1; }
    $n = 0;
    while (($line = fgets($fh)) !== false) {
        if (preg_match($regex, $line)) { $n++; }
    }
    fclose($fh);
    return $n;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    out(405, ['ok' => false, 'reason' => 'E_METODO', 'esperado' => 'POST', 'tag' => TAG]);
}

// ── 1. Entrada ──────────────────────────────────────────────────────────────
$raw = @file_get_contents('php://input', false, null, 0, 1 << 20);
$in  = json_decode($raw ?: '{}', true);
if (!is_array($in)) {
    out(400, ['ok' => false, 'reason' => 'E_JSON_INVALIDO', 'tag' => TAG]);
}

$lista = isset($in['lista']) ? trim((string) $in['lista']) : '';
if ($lista === '') {
    out(400, ['ok' => false, 'reason' => 'E_LISTA_REQUERIDA', 'tag' => TAG]);
}
if (!preg_match('/^[A-Za-z0-9._-]{1,180}$/', $lista) || strpos($lista, '..') !== false) {
    out(400, ['ok' => false, 'reason' => 'E_LISTA_INVALIDA', 'lista' => $lista, 'tag' => TAG]);
}
if (strpos($lista, '_PLACEHOLDER') !== false) {
    out(409, ['ok' => false, 'reason' => 'E_YA_ES_PLACEHOLDER', 'lista' => $lista, 'tag' => TAG]);
}

$base = realpath(ALLOWED_DIR);
$src  = ($base === false) ? false : realpath($base . DIRECTORY_SEPARATOR . $lista);
if ($src === false || strpos($src, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($src)) {
    out(404, ['ok' => false, 'reason' => 'E_LISTA_NO_EXISTE', 'lista' => $lista, 'tag' => TAG]);
}

// ── 2. Pre-requisitos ───────────────────────────────────────────────────────
foreach ([SCRIPT_PROJECT, SCRIPT_PROJ_JS] as $need) {
    if (!is_file($need) || !is_readable($need)) {
        out(503, ['ok' => false, 'reason' => 'E_SCRIPT_AUSENTE', 'script' => $need, 'tag' => TAG]);
    }
}

$t0        = microtime(true);
// El nombre de salida tiene que ser EXACTAMENTE el que produce ape-list-project.sh.
// El script hace:  base="${SRC%_CABLEADA.m3u8}"; OUT_OTT="${base}_CABLEADA_LIGHT.m3u8"
// O sea: quita el sufijo "_CABLEADA.m3u8" (14 caracteres) si esta, y SOLO si esta.
// Replicarlo mal produce un nombre distinto y el endpoint buscaria un fichero que no existe.
$srcBase = basename($src);
$stem    = (substr($srcBase, -14) === '_CABLEADA.m3u8')
    ? substr($srcBase, 0, -14)
    : $srcBase;
$ottName   = $stem . '_CABLEADA_LIGHT.m3u8';
$phName    = $stem . '_PLACEHOLDER.m3u8';
$ottPath   = ALLOWED_DIR . '/' . $ottName;
$phFinal   = ALLOWED_DIR . '/' . $phName;
$phTmp     = '/tmp/' . $phName;

// Limpia restos de intentos previos SOLO en /tmp (nunca en el directorio servido).
@unlink($phTmp);
@unlink($phTmp . '.gz');

// ── 3. PROYECCION OTT ───────────────────────────────────────────────────────
[$rc1, $log1] = run('timeout ' . STEP_TIMEOUT . ' bash ' . escapeshellarg(SCRIPT_PROJECT)
    . ' ' . escapeshellarg($src) . ' 2>&1');
if ($rc1 !== 0 || !is_file($ottPath)) {
    out(500, [
        'ok' => false, 'reason' => 'E_PROYECCION_FALLO', 'paso' => 1, 'exit' => $rc1,
        'esperado' => $ottPath, 'log' => $log1, 'ms' => (int) round((microtime(true) - $t0) * 1000),
        'tag' => TAG,
    ]);
}

// ── 4. PLANTILLAS + INDICE ──────────────────────────────────────────────────
// Se escribe a /tmp porque ape-profile-project.js rechaza destinos dentro de
// /var/www/lists (y hace bien: la proyeccion nunca debe pisar el original).
[$rc2, $log2] = run('timeout ' . STEP_TIMEOUT . ' node ' . escapeshellarg(SCRIPT_PROJ_JS)
    . ' light ' . escapeshellarg($ottPath)
    . ' ' . escapeshellarg($phTmp)
    . ' --origin ' . escapeshellarg($src)
    . ' --gz 2>&1');
if ($rc2 !== 0 || !is_file($phTmp) || filesize($phTmp) < 1024) {
    out(500, [
        'ok' => false, 'reason' => 'E_PLANTILLAS_FALLO', 'paso' => 2, 'exit' => $rc2,
        'log' => $log2, 'ms' => (int) round((microtime(true) - $t0) * 1000), 'tag' => TAG,
    ]);
}

// ── 5. VERIFICACION DEL CONTRATO (antes de publicar nada) ───────────────────
$nCanales    = countLines($phTmp, '/^#EXTINF/');
$nUrls       = countLines($phTmp, '/^https?:\/\//');
$nPulse      = countLines($phTmp, '/\/pulse\//');
$nPlantillas = countLines($phTmp, '/^#EXT-X-APE-PROFILE-TEMPLATE:/');
$nIndice     = countLines($phTmp, '/^#EXT-X-APE-PROFILE-INDEX:/');
$nApe        = countLines($phTmp, '/^#EXT-X-APE-/');
$nShimott    = countLines($phTmp, '/^#EXTSHIMOTT:/');
$nLab        = countLines($phTmp, '/^#EXT-X-APE-LAB-METADATA:/');

// Contrato LIGHT. OJO: el numero de plantillas NO es fijo.
// Las plantillas son una por FORMA distinta detectada en la lista, y una lista de un solo
// perfil tiene menos formas que una mezclada. Medido: la lista P3 sola produce 4 formas
// (P3.5+T5 x14462, P3.5+T6 x4405, P3.5+T7 x1320, P3.5+T9 x35); la lista completa de 4
// perfiles produce 9. Exigir "=== 9" rechazaria listas validas por perfil. Lo que SI es
// invariante: hay al menos una plantilla, hay UN indice, y el indice declara exactamente
// tantos pares como plantillas hay (coherencia interna verificada abajo).
$errs = [];
if ($nCanales < 1)          { $errs[] = 'E_CANALES_0'; }
if ($nUrls !== $nCanales)   { $errs[] = 'E_URLS_NO_CUADRA:' . $nUrls . '/' . $nCanales; }
if ($nPulse < 1)            { $errs[] = 'E_SIN_PULSE'; }
if ($nPlantillas < 1)       { $errs[] = 'E_SIN_PLANTILLAS'; }
if ($nPlantillas > 12)      { $errs[] = 'E_PLANTILLAS_EXCESO:' . $nPlantillas; }
if ($nIndice !== 1)         { $errs[] = 'E_INDICE:' . $nIndice; }
// Toda la familia APE debe vivir en la cabecera, no por canal. El umbral es holgado
// (64) porque la cabecera crece con GOVERNANCE/ENGINE/INDEX/plantillas; lo que se
// detecta aqui es la regresion de emitir APE en los 20.000+ bloques de canal.
if ($nApe > 64)             { $errs[] = 'E_APE_EN_CUERPO:' . $nApe; }

// Coherencia interna: el indice declara los pares; deben coincidir con las plantillas.
$paresEnIndice = -1;
$fhIdx = @fopen($phTmp, 'rb');
if ($fhIdx !== false) {
    while (($line = fgets($fhIdx)) !== false) {
        if (strpos($line, '#EXT-X-APE-PROFILE-INDEX:') === 0) {
            $jsonIdx = substr($line, strlen('#EXT-X-APE-PROFILE-INDEX:'));
            $idx = json_decode(trim($jsonIdx), true);
            if (is_array($idx) && isset($idx['pairs']) && is_array($idx['pairs'])) {
                $paresEnIndice = count($idx['pairs']);
            }
            break;
        }
    }
    fclose($fhIdx);
}
if ($paresEnIndice < 0) {
    $errs[] = 'E_INDICE_NO_DECODIFICA';
} elseif ($paresEnIndice !== $nPlantillas) {
    $errs[] = 'E_INDICE_INCOHERENTE:' . $paresEnIndice . 'pares/' . $nPlantillas . 'plantillas';
}

if ($errs !== []) {
    @unlink($phTmp);
    @unlink($phTmp . '.gz');
    out(422, [
        'ok' => false, 'reason' => 'E_CONTRATO_INCUMPLIDO', 'paso' => 3,
        'errores' => $errs,
        'medido' => [
            'canales' => $nCanales, 'urls' => $nUrls, 'pulse' => $nPulse,
            'plantillas' => $nPlantillas, 'indice' => $nIndice,
            'ape_en_cuerpo' => $nApe, 'shimott' => $nShimott, 'lab' => $nLab,
        ],
        'log' => $log2, 'ms' => (int) round((microtime(true) - $t0) * 1000), 'tag' => TAG,
    ]);
}

// ── 6. INSTALACION (movimiento atomico desde /tmp) ──────────────────────────
if (!@rename($phTmp, $phFinal)) {
    if (!@copy($phTmp, $phFinal)) {
        out(500, ['ok' => false, 'reason' => 'E_INSTALACION_FALLO', 'paso' => 4, 'tag' => TAG]);
    }
    @unlink($phTmp);
}
if (is_file($phTmp . '.gz')) {
    @copy($phTmp . '.gz', $phFinal . '.gz');
    @unlink($phTmp . '.gz');
}
@chown($phFinal, 'www-data');
@chown($phFinal . '.gz', 'www-data');
@chmod($phFinal, 0644);
@chmod($phFinal . '.gz', 0644);

// ── 7. ENLACE ESTABLE (0,00 MB) ─────────────────────────────────────────────
// Solo se mueve DESPUES de que el contrato paso: si algo falla, el enlace anterior
// sigue apuntando a la lista anterior y la reproduccion no se entera.
$link = ALLOWED_DIR . '/' . LINK_NAME;
@unlink($link);
@unlink($link . '.gz');
$linked = @symlink($phName, $link);
if (is_file($phFinal . '.gz')) { @copy($phFinal . '.gz', $link . '.gz'); @chmod($link . '.gz', 0644); }
@chown($link, 'www-data');

out(200, [
    'ok'          => true,
    'tag'         => TAG,
    'origen'      => $lista,
    'origen_bytes' => filesize($src),
    'placeholder' => $phName,
    'placeholder_bytes' => filesize($phFinal),
    'placeholder_gz_bytes' => is_file($phFinal . '.gz') ? filesize($phFinal . '.gz') : null,
    'proyeccion'  => $ottName,
    'proyeccion_bytes' => filesize($ottPath),
    'enlace'      => $link,
    'enlace_creado' => $linked,
    'enlace_bytes'  => $linked ? lstat($link)['size'] : null,
    'url'         => 'https://iptv-ape.duckdns.org/lists/' . LINK_NAME,
    'medido'      => [
        'canales' => $nCanales, 'urls' => $nUrls, 'pulse' => $nPulse,
        'plantillas' => $nPlantillas, 'indice' => $nIndice,
        'ape_en_cuerpo' => $nApe, 'shimott' => $nShimott, 'lab' => $nLab,
    ],
    'ms'          => (int) round((microtime(true) - $t0) * 1000),
]);
